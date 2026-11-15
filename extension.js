import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ParentalControls from 'resource:///org/gnome/shell/misc/parentalControlsManager.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {getAppFavorites} from 'resource:///org/gnome/shell/ui/appFavorites.js';

import {TABS, buildCatalog, favoriteApps, fitColumns, searchCatalog} from './lib/catalog.js';

const INITIAL_ROWS = 5;
const ROWS_PER_IDLE = 4;
const PANEL_RADIUS = 28;

export default class NovaLauncher extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._apps = Shell.AppSystem.get_default();
        this._favorites = getAppFavorites();
        this._parentalControls = ParentalControls.getDefault();
        this._appearance = St.Settings.get();
        this._tileCache = new Map();
        this._tab = 'All';
        this._grab = null;
        this._columns = 1;
        this._renderSource = 0;
        this._overviewIdle = 0;
        this._overviewHiddenId = 0;
        this._overlayId = 0;
        this._originalOverlayId = 0;
        this._addedSuperPopupMode = false;

        this._buildUI();
        this._updateCatalog();
        this._apps.connectObject('installed-changed', () => this._updateCatalog(), this);
        this._parentalControls.connectObject('app-filter-changed', () => this._updateCatalog(), this);
        this._favorites.connectObject('changed', () => this._refresh(), this);
        this._appearance.connectObject(
            'notify::color-scheme', () => this._updateAppearance(),
            'notify::high-contrast', () => this._updateAppearance(), this);
        Main.layoutManager.connectObject(
            'monitors-changed', () => this._hide(),
            'system-modal-opened', () => this._hide(), this);
        Main.overview.connectObject('showing', () => {
            if (this._grab)
                this._hide();
        }, this);
        Main.sessionMode.connectObject('updated', () => {
            if (Main.sessionMode.isLocked || Main.sessionMode.isGreeter)
                this._hide();
        }, this);
        global.workspace_manager.connectObject('active-workspace-changed', () => this._hide(), this);
        this._settings.connectObject(
            'changed::toggle-shortcut', () => this._bindShortcut(),
            'changed::use-super', () => this._configureSuper(),
            'changed::window-width', () => this._relayout(),
            'changed::columns', () => this._relayout(),
            'changed::icon-size', () => this._relayout(),
            'changed::glass-effect', () => this._updateAppearance(), this);
        this._updateAppearance();
        this._bindShortcut();
        this._configureSuper();
    }

    disable() {
        this._restoreSuper();
        Main.wm.removeKeybinding('toggle-shortcut');
        this._hide();
        this._settings.disconnectObject(this);
        this._apps.disconnectObject(this);
        this._parentalControls.disconnectObject(this);
        this._favorites.disconnectObject(this);
        this._appearance.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        Main.overview.disconnectObject(this);
        Main.sessionMode.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);
        for (const {button} of this._tileCache.values())
            button.destroy();
        this._tileCache.clear();
        this._tabButtons.clear();
        St.FocusManager.get_for_stage(global.stage).remove_group(this._panel);
        this._layer.destroy();
        this._layer = null;
        this._settings = null;
        this._catalog = [];
        this._resultRows = [];
    }

    _buildUI() {
        this._layer = new St.Widget({reactive: true, visible: false});
        this._shade = new St.Button({accessible_name: 'Dismiss Applications'});
        this._shade.connect('clicked', () => this._hide());
        this._layer.add_child(this._shade);

        this._surface = new St.Widget({layout_manager: new Clutter.BinLayout()});
        this._surface.set_pivot_point(0.5, 0.5);
        this._layer.add_child(this._surface);
        this._blurLayer = new St.Widget({
            x_expand: true, y_expand: true, style_class: 'nova-launcher-blur',
        });
        this._blur = new Shell.BlurEffect({
            mode: Shell.BlurMode.BACKGROUND, radius: 28, brightness: 1,
        });
        this._blurLayer.add_effect(this._blur);
        this._surface.add_child(this._blurLayer);
        this._panel = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true, x_expand: true, y_expand: true,
            accessible_name: 'Applications', style_class: 'nova-launcher-panel',
        });
        this._surface.add_child(this._panel);

        const header = new St.BoxLayout({style_class: 'nova-launcher-header'});
        this._title = new St.Label({
            text: 'Applications', y_align: Clutter.ActorAlign.CENTER,
            style_class: 'nova-launcher-title',
        });
        header.add_child(this._title);
        this._search = new St.Entry({
            hint_text: 'Search apps…', accessible_name: 'Search applications',
            can_focus: true, x_expand: true, style_class: 'nova-launcher-search',
        });
        this._search.set_primary_icon(new St.Icon({icon_name: 'system-search-symbolic'}));
        this._search.clutter_text.connect('notify::text', () => {
            if (this._grab)
                this._render();
        });
        this._search.clutter_text.connect('activate', () => {
            const first = this._resultRows[0]?.[0];
            if (first)
                this._launch(first);
        });
        this._search.clutter_text.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Down)
                return Clutter.EVENT_PROPAGATE;
            if (this._resultRows.length)
                this._focusTile(0, 0);
            return Clutter.EVENT_STOP;
        });
        header.add_child(this._search);
        const close = new St.Button({
            accessible_name: 'Close Applications', can_focus: true,
            style_class: 'nova-launcher-close',
            child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 16}),
        });
        close.connect('clicked', () => this._hide());
        header.add_child(close);
        this._panel.add_child(header);

        this._tabScroll = new St.ScrollView({
            overlay_scrollbars: true, clip_to_allocation: true,
            style_class: 'nova-launcher-tab-scroll',
        });
        this._tabScroll.set_policy(St.PolicyType.EXTERNAL, St.PolicyType.NEVER);
        const tabs = new St.BoxLayout({style_class: 'nova-launcher-tabs'});
        this._tabScroll.set_child(tabs);
        this._panel.add_child(this._tabScroll);
        this._tabButtons = new Map();
        for (const tab of TABS) {
            const button = new St.Button({
                label: tab, style_class: 'nova-launcher-tab', can_focus: true,
            });
            button.child.ellipsize = Pango.EllipsizeMode.NONE;
            button.connect('clicked', () => {
                this._tab = tab;
                this._render();
            });
            button.connect('key-focus-in', () => this._reveal(this._tabScroll, tabs, button, false));
            tabs.add_child(button);
            this._tabButtons.set(tab, button);
        }

        this._scroll = new St.ScrollView({
            style_class: 'nova-launcher-scroll', x_expand: true, y_expand: true,
            overlay_scrollbars: false, clip_to_allocation: true,
        });
        this._scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        const scrollbar = this._scroll.get_children().find(actor =>
            actor instanceof St.ScrollBar && actor.orientation === Clutter.Orientation.VERTICAL);
        scrollbar.track_hover = true;
        scrollbar.opacity = 0;
        let dragging = false;
        const syncScrollbar = () => {
            scrollbar.opacity = scrollbar.mapped && (scrollbar.hover || dragging) ? 255 : 0;
        };
        scrollbar.connect('notify::hover', syncScrollbar);
        scrollbar.connect('scroll-start', () => {
            dragging = true;
            syncScrollbar();
        });
        scrollbar.connect('scroll-stop', () => {
            dragging = false;
            syncScrollbar();
        });
        scrollbar.connect('notify::mapped', () => {
            if (!scrollbar.mapped)
                dragging = false;
            syncScrollbar();
        });
        this._rows = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, style_class: 'nova-launcher-rows',
        });
        this._scroll.set_child(this._rows);
        this._panel.add_child(this._scroll);
        this._layer.connect('captured-event', (_actor, event) => {
            if (event.type() !== Clutter.EventType.KEY_PRESS)
                return Clutter.EVENT_PROPAGATE;
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this._hide();
                return Clutter.EVENT_STOP;
            }
            const search = this._search.clutter_text;
            const modifiers = Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.MOD1_MASK |
                Clutter.ModifierType.MOD4_MASK | Clutter.ModifierType.SUPER_MASK |
                Clutter.ModifierType.META_MASK;
            if (global.stage.get_key_focus() !== search && !(event.get_state() & modifiers)) {
                const character = event.get_key_unicode();
                if (character && character !== ' ' && GLib.unichar_isprint(character)) {
                    search.grab_key_focus();
                    search.insert_unichar(character);
                    return Clutter.EVENT_STOP;
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });
        Main.layoutManager.addTopChrome(this._layer);
        St.FocusManager.get_for_stage(global.stage).add_group(this._panel);
    }

    _updateAppearance() {
        const highContrast = this._appearance.high_contrast;
        const useGlass = this._settings.get_boolean('glass-effect') && !highContrast;
        this._blurLayer.visible = useGlass;
        this._panel.set_style_class_name([
            'nova-launcher-panel',
            this._appearance.color_scheme === St.SystemColorScheme.PREFER_LIGHT ? 'light' : '',
            useGlass ? 'glass' : '',
            highContrast ? 'high-contrast' : '',
        ].filter(Boolean).join(' '));
    }

    _position() {
        const monitor = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
        if (!monitor)
            return false;
        const area = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        const width = Math.min(this._settings.get_int('window-width'), area.width - 24);
        const height = Math.min(600, area.height - 32);
        if (width < 1 || height < 1)
            return false;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._columns = fitColumns(width / scale, this._settings.get_int('columns'),
            this._settings.get_int('icon-size'));
        this._title.visible = width / scale >= 440;
        this._layer.set_size(global.stage.width, global.stage.height);
        this._shade.set_size(global.stage.width, global.stage.height);
        this._surface.set_size(width, height);
        this._surface.set_position(
            Math.round(area.x + (area.width - width) / 2),
            Math.round(area.y + (area.height - height) / 2));
        this._blur.radius = PANEL_RADIUS * scale;
        return true;
    }

    _relayout() {
        if (this._grab) {
            if (this._position())
                this._refresh();
            else
                this._hide();
        }
    }

    _updateCatalog() {
        this._catalog = buildCatalog(this._apps.get_installed(),
            info => this._parentalControls.shouldShowApp(info));
        this._refresh();
        const ids = new Set(this._catalog.map(item => item.id));
        for (const [id, tile] of this._tileCache) {
            if (!ids.has(id)) {
                tile.button.destroy();
                this._tileCache.delete(id);
            }
        }
    }

    _refresh() {
        if (this._grab)
            this._render();
    }

    _render() {
        this._stopRendering();
        const focus = global.stage.get_key_focus();
        const focusedTile = focus && this._rows.contains(focus) ? focus : null;
        if (focusedTile)
            this._search.clutter_text.grab_key_focus();

        for (const {button} of this._tileCache.values())
            button.get_parent()?.remove_child(button);
        this._rows.destroy_all_children();
        this._scroll.vadjustment.value = 0;
        for (const [tab, button] of this._tabButtons) {
            button.checked = tab === this._tab;
        }

        const query = this._search.get_text().trim();
        const favorites = this._tab === 'All' && !query
            ? favoriteApps(this._catalog, this._favorites.getFavorites().map(app => app.get_id()), this._columns)
            : [];
        const favoriteIds = new Set(favorites.map(item => item.id));
        const apps = searchCatalog(this._catalog, query, this._tab)
            .filter(item => !favoriteIds.has(item.id));
        this._hasFavorites = favorites.length > 0;
        this._resultRows = this._hasFavorites ? [favorites] : [];
        for (let offset = 0; offset < apps.length; offset += this._columns)
            this._resultRows.push(apps.slice(offset, offset + this._columns));
        this._renderedRows = 0;

        if (!this._resultRows.length) {
            this._rows.add_child(new St.Label({
                text: 'No matching applications',
                style_class: 'nova-launcher-empty',
                x_align: Clutter.ActorAlign.CENTER,
            }));
            return;
        }

        this._appendRows(INITIAL_ROWS);
        if (focusedTile) {
            const row = this._resultRows.findIndex(items =>
                items.some(item => this._tileCache.get(item.id)?.button === focusedTile));
            if (row >= 0) {
                const column = this._resultRows[row].findIndex(
                    item => this._tileCache.get(item.id)?.button === focusedTile);
                this._focusTile(row, column);
            }
        }

        if (this._renderedRows < this._resultRows.length) {
            this._renderSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
                this._appendRows(this._renderedRows + ROWS_PER_IDLE);
                if (this._renderedRows < this._resultRows.length)
                    return GLib.SOURCE_CONTINUE;
                this._renderSource = 0;
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _appendRows(end) {
        const iconSize = this._settings.get_int('icon-size');
        while (this._renderedRows < Math.min(end, this._resultRows.length)) {
            const index = this._renderedRows++;
            const apps = this._resultRows[index];
            const row = new St.Widget({
                layout_manager: new Clutter.BoxLayout({homogeneous: true}),
                x_expand: true, style_class: 'nova-launcher-app-row',
            });
            if (index === 0 && this._hasFavorites)
                row.add_style_class_name('favorites');
            for (let column = 0; column < this._columns; column++) {
                const item = apps[column];
                if (item) {
                    const tile = this._getTile(item, iconSize);
                    tile.row = index;
                    tile.column = column;
                    row.add_child(tile.button);
                } else {
                    row.add_child(new St.Widget({x_expand: true}));
                }
            }
            this._rows.add_child(row);
        }
    }

    _getTile(item, iconSize) {
        let tile = this._tileCache.get(item.id);
        if (!tile) {
            const contents = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL});
            const icon = new St.Icon({
                style_class: 'nova-launcher-icon', x_align: Clutter.ActorAlign.CENTER,
            });
            const label = new St.Label({style_class: 'nova-launcher-app-name'});
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            contents.add_child(icon);
            contents.add_child(label);
            const button = new St.Button({
                can_focus: true, x_expand: true, style_class: 'nova-launcher-app',
                child: contents, label_actor: label,
            });
            tile = {button, icon, label};
            this._tileCache.set(item.id, tile);
            button.connect('clicked', () => this._launch(tile.item));
            button.connect('key-press-event', (_actor, event) => this._navigateGrid(tile, event));
            button.connect('key-focus-in', () => this._reveal(this._scroll, this._rows, button, true));
        }
        if (tile.item !== item) {
            tile.item = item;
            tile.icon.gicon = item.info.get_icon() ??
                new Gio.ThemedIcon({name: 'application-x-executable'});
            tile.label.text = item.name;
            tile.button.accessible_name = item.name;
        }
        tile.icon.icon_size = iconSize;
        return tile;
    }

    _navigateGrid(tile, event) {
        let {row, column} = tile;
        switch (event.get_key_symbol()) {
        case Clutter.KEY_Down: row++; break;
        case Clutter.KEY_Up: row--; break;
        case Clutter.KEY_Right:
            column += this._panel.text_direction === Clutter.TextDirection.RTL ? -1 : 1;
            break;
        case Clutter.KEY_Left:
            column += this._panel.text_direction === Clutter.TextDirection.RTL ? 1 : -1;
            break;
        default: return Clutter.EVENT_PROPAGATE;
        }

        if (row < 0) {
            this._search.clutter_text.grab_key_focus();
        } else if (this._resultRows[row] && column >= 0) {
            const last = this._resultRows[row].length - 1;
            if (row !== tile.row || column <= last)
                this._focusTile(row, Math.min(column, last));
        }
        return Clutter.EVENT_STOP;
    }

    _focusTile(row, column) {
        this._appendRows(row + 1);
        const item = this._resultRows[row][column];
        this._tileCache.get(item.id).button.grab_key_focus();
    }

    _reveal(scroll, content, actor, vertical) {
        if (actor.has_allocation()) {
            this._scrollToActor(scroll, content, actor, vertical);
        } else {
            const id = actor.connect('notify::allocation', () => {
                actor.disconnect(id);
                if (global.stage.get_key_focus() === actor && content.contains(actor))
                    this._scrollToActor(scroll, content, actor, vertical);
            });
        }
    }

    _scrollToActor(scroll, content, actor, vertical) {
        const box = actor.get_allocation_box();
        let start = vertical ? box.y1 : box.x1;
        for (let parent = actor.get_parent(); parent !== content; parent = parent.get_parent()) {
            const parentBox = parent.get_allocation_box();
            start += vertical ? parentBox.y1 : parentBox.x1;
        }
        const size = vertical ? box.get_height() : box.get_width();
        const adjustment = vertical ? scroll.vadjustment : scroll.hadjustment;
        adjustment.clamp_page(start, start + size);
    }

    _stopRendering() {
        if (this._renderSource) {
            GLib.source_remove(this._renderSource);
            this._renderSource = 0;
        }
    }

    _launch(item) {
        if (!this._parentalControls.shouldShowApp(item.info))
            return;
        this._hide();
        try {
            const app = this._apps.lookup_app(item.id);
            if (app)
                app.activate();
            else
                item.info.launch([], global.create_app_launch_context(0, -1));
        } catch (error) {
            console.error('[Nova Launcher] Could not launch ' + item.id, error);
        }
    }

    _toggle() {
        if (this._grab || this._overviewHiddenId || this._overviewIdle)
            this._hide();
        else
            this._show();
    }

    _show() {
        if (Main.sessionMode.isLocked || Main.sessionMode.isGreeter)
            return;
        if (Main.overview.visible) {
            this._overviewHiddenId = Main.overview.connect('hidden', () => {
                Main.overview.disconnect(this._overviewHiddenId);
                this._overviewHiddenId = 0;
                // The Overview releases its own grab after emitting hidden.
                this._overviewIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    this._overviewIdle = 0;
                    if (!Main.overview.visible)
                        this._show();
                    return GLib.SOURCE_REMOVE;
                });
            });
            Main.overview.hide();
            return;
        }
        if (!this._position())
            return;

        this._tab = 'All';
        this._search.set_text('');
        this._tabScroll.hadjustment.value = 0;
        this._layer.show();
        try {
            this._grab = Main.pushModal(this._layer, {actionMode: Shell.ActionMode.POPUP});
            if (this._grab.is_revoked()) {
                this._hide();
                return;
            }
            this._syncSuperPopupMode();
            this._render();
            this._search.clutter_text.grab_key_focus();

            const duration = this._settings.get_int('animation-duration');
            if (duration > 0 && this._appearance.reduced_motion !== St.ReducedMotion.REDUCE) {
                this._surface.set_scale(0.98, 0.98);
                this._surface.ease({
                    scale_x: 1, scale_y: 1, duration,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            }
        } catch (error) {
            this._hide();
            console.error('[Nova Launcher] Could not open Applications', error);
        }
    }

    _hide() {
        if (this._overviewHiddenId) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = 0;
        }
        if (this._overviewIdle) {
            GLib.source_remove(this._overviewIdle);
            this._overviewIdle = 0;
        }
        this._stopRendering();
        if (this._grab) {
            const grab = this._grab;
            this._grab = null;
            this._syncSuperPopupMode();
            Main.popModal(grab);
        }
        this._surface.remove_all_transitions();
        this._surface.set_scale(1, 1);
        this._layer.hide();
    }

    _bindShortcut() {
        Main.wm.removeKeybinding('toggle-shortcut');
        if (!this._settings.get_strv('toggle-shortcut').length)
            return;

        const binding = Main.wm.addKeybinding(
            'toggle-shortcut', this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            () => {
                if (Main.actionMode !== Shell.ActionMode.POPUP || this._grab)
                    this._toggle();
            });
        if (binding === Meta.KeyBindingAction.NONE)
            console.warn('[Nova Launcher] Shortcut unavailable');
    }

    _configureSuper() {
        this._restoreSuper();
        if (!this._settings.get_boolean('use-super'))
            return;

        const original = GObject.signal_handler_find(global.display, {signalId: 'overlay-key'});
        if (!original)
            return;
        global.display.block_signal_handler(original);
        this._originalOverlayId = original;
        this._overlayId = global.display.connect('overlay-key', () => {
            if (Main.actionMode !== Shell.ActionMode.POPUP || this._grab)
                this._toggle();
        });
        this._syncSuperPopupMode();
    }

    _syncSuperPopupMode() {
        // Mutter filters the overlay key while Nova holds a POPUP grab.
        // Extend the binding's existing modes only for the lifetime of that grab.
        const modes = Main.wm._allowedKeybindings['overlay-key'];
        const popup = Shell.ActionMode.POPUP;
        if (this._grab && this._overlayId) {
            if (!(modes & popup)) {
                Main.wm.allowKeybinding('overlay-key', modes | popup);
                this._addedSuperPopupMode = true;
            }
        } else if (this._addedSuperPopupMode) {
            Main.wm.allowKeybinding('overlay-key', modes & ~popup);
            this._addedSuperPopupMode = false;
        }
    }

    _restoreSuper() {
        if (this._overlayId) {
            global.display.disconnect(this._overlayId);
            this._overlayId = 0;
            this._syncSuperPopupMode();
        }
        if (this._originalOverlayId) {
            if (GObject.signal_handler_is_connected(global.display, this._originalOverlayId))
                global.display.unblock_signal_handler(this._originalOverlayId);
            this._originalOverlayId = 0;
        }
    }
}
