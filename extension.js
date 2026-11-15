import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {TABS, buildCatalog, searchCatalog, fitColumns} from './lib/catalog.js';

export default class NovaLauncher extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._apps = Shell.AppSystem.get_default();
        this._catalog = buildCatalog(this._apps.get_installed());
        this._tab = 'All';
        this._index = 0;
        this._tiles = [];
        this._grab = null;
        this._visible = false;
        this._overlayId = 0;
        this._originalOverlayId = 0;
        this._buildUI();
        this._appsId = this._apps.connect('installed-changed', () => {
            this._catalog = buildCatalog(this._apps.get_installed());
            if (this._visible) this._render();
        });
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => {
            if (this._visible) this._position();
        });
        this._settingsId = this._settings.connect('changed', (_s,key) => {
            if (key === 'toggle-shortcut') this._bindShortcut();
            else if (key === 'use-super') this._configureSuper();
            else if (this._visible) { this._position(); this._render(); }
        });
        this._bindShortcut();
        this._configureSuper();
    }

    disable() {
        this._restoreSuper();
        Main.wm.removeKeybinding('toggle-shortcut');
        this._hide();
        if (this._settingsId) this._settings.disconnect(this._settingsId);
        if (this._appsId) this._apps.disconnect(this._appsId);
        if (this._monitorsId) Main.layoutManager.disconnect(this._monitorsId);
        this._layer?.destroy();
        this._layer = null;
        this._settings = null;
        this._apps = null;
        this._catalog = null;
    }

    _buildUI() {
        this._layer = new St.Widget({reactive:true, visible:false});
        this._shade = new St.Button({
            reactive:true, style_class:'nova-launcher-backdrop',
        });
        this._shade.connect('clicked', () => this._hide());
        this._layer.add_child(this._shade);
        this._panel = new St.BoxLayout({
            orientation:Clutter.Orientation.VERTICAL, reactive:true, can_focus:true,
            style_class:'nova-launcher-panel',
        });
        this._panel.set_pivot_point(0.5,0.5);
        this._layer.add_child(this._panel);

        const header = new St.BoxLayout({style_class:'nova-launcher-header'});
        const heading = new St.BoxLayout({orientation:Clutter.Orientation.VERTICAL, x_expand:true});
        heading.add_child(new St.Label({
            text:'Applications', style_class:'nova-launcher-title',
        }));
        heading.add_child(new St.Label({
            text:'Find what you need', style_class:'nova-launcher-subtitle',
        }));
        header.add_child(heading);
        const close = new St.Button({
            label:'Close', style_class:'nova-launcher-close', can_focus:true,
        });
        close.connect('clicked', () => this._hide());
        header.add_child(close);
        this._panel.add_child(header);

        this._search = new St.Entry({
            hint_text:'Search applications…', can_focus:true, x_expand:true,
            style_class:'nova-launcher-search',
        });
        this._search.clutter_text.connect('notify::text', () => {
            this._index = 0;
            this._render();
        });
        this._search.clutter_text.connect('key-press-event', (_a,event) => {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Escape) {
                this._hide();
                return Clutter.EVENT_STOP;
            }
            if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
                this._launchSelected();
                return Clutter.EVENT_STOP;
            }
            if (key === Clutter.KEY_Down || key === Clutter.KEY_Up ||
                key === Clutter.KEY_Right || key === Clutter.KEY_Left) {
                const step = key === Clutter.KEY_Down ? this._columns :
                    key === Clutter.KEY_Up ? -this._columns :
                    key === Clutter.KEY_Right ? 1 : -1;
                this._move(step);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._panel.add_child(this._search);
        this._tabs = new St.BoxLayout({style_class:'nova-launcher-tabs'});
        this._panel.add_child(this._tabs);
        this._scroll = new St.ScrollView({
            style_class:'nova-launcher-scroll', x_expand:true, y_expand:true,
        });
        this._scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this._rows = new St.BoxLayout({
            orientation:Clutter.Orientation.VERTICAL, style_class:'nova-launcher-rows',
        });
        this._scroll.set_child(this._rows);
        this._panel.add_child(this._scroll);
        this._footer = new St.Label({style_class:'nova-launcher-footer'});
        this._panel.add_child(this._footer);
        this._layer.connect('key-press-event', (_a,event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this._hide();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        Main.layoutManager.addChrome(this._layer, {affectsStruts:false, trackFullscreen:true});
    }

    _position() {
        const monitors = Main.layoutManager.monitors;
        const monitor = monitors[global.display.get_current_monitor()] ||
            Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        this._width = Math.max(260, Math.min(
            this._settings.get_int('window-width'), monitor.width - 40));
        this._height = Math.max(220, Math.min(600, monitor.height - 80));
        this._columns = fitColumns(this._width, this._settings.get_int('columns'));
        const stageWidth = global.stage.width;
        const stageHeight = global.stage.height;
        this._layer.set_position(0,0);
        this._layer.set_size(stageWidth,stageHeight);
        this._shade.set_position(0,0);
        this._shade.set_size(stageWidth,stageHeight);
        this._panel.set_size(this._width,this._height);
        this._panel.set_position(
            Math.round(monitor.x + (monitor.width - this._width)/2),
            Math.round(monitor.y + (monitor.height - this._height)/2));
    }

    _renderTabs() {
        this._tabs.destroy_all_children();
        for (const tab of TABS) {
            const button = new St.Button({
                label:tab, style_class:'nova-launcher-tab', can_focus:true,
            });
            if (tab === this._tab) button.add_style_pseudo_class('active');
            button.connect('clicked', () => {
                this._tab = tab;
                this._index = 0;
                this._render();
                this._search.grab_key_focus();
            });
            this._tabs.add_child(button);
        }
    }

    _render() {
        if (!this._rows || !this._settings) return;
        this._renderTabs();
        this._rows.destroy_all_children();
        this._tiles = [];
        const result = searchCatalog(this._catalog, this._search.get_text(), this._tab);
        const iconSize = this._settings.get_int('icon-size');
        if (!result.items.length) {
            this._rows.add_child(new St.Label({
                text:'No matching applications', style_class:'nova-launcher-empty',
            }));
        }
        for (let offset = 0; offset < result.items.length; offset += this._columns) {
            const row = new St.BoxLayout({style_class:'nova-launcher-app-row'});
            for (const item of result.items.slice(offset, offset + this._columns)) {
                const button = new St.Button({
                    style_class:'nova-launcher-app', can_focus:true, x_expand:true,
                });
                const contents = new St.BoxLayout({
                    orientation:Clutter.Orientation.VERTICAL, x_align:Clutter.ActorAlign.CENTER,
                });
                contents.add_child(new St.Icon({
                    gicon:item.info.get_icon() || new Gio.ThemedIcon({
                        name:'application-x-executable',
                    }),
                    icon_size:iconSize, style_class:'nova-launcher-icon',
                    x_align:Clutter.ActorAlign.CENTER,
                }));
                contents.add_child(new St.Label({
                    text:item.name, style_class:'nova-launcher-app-name',
                    x_align:Clutter.ActorAlign.CENTER,
                }));
                button.set_child(contents);
                button.connect('clicked', () => this._launch(item));
                row.add_child(button);
                this._tiles.push({button,item});
            }
            this._rows.add_child(row);
        }
        this._index = Math.min(this._index, Math.max(0,this._tiles.length - 1));
        this._highlight();
        this._footer.text = result.total > result.items.length
            ? result.items.length + ' of ' + result.total + ' applications — refine search'
            : result.total + (result.total === 1 ? ' application' : ' applications') +
                ' · Esc to close';
    }

    _highlight() {
        for (let i = 0; i < this._tiles.length; i++) {
            const tile = this._tiles[i].button;
            if (i === this._index) tile.add_style_pseudo_class('selected');
            else tile.remove_style_pseudo_class('selected');
        }
    }

    _move(step) {
        if (!this._tiles.length) return;
        this._index = Math.max(0, Math.min(this._tiles.length - 1, this._index + step));
        this._highlight();
    }

    _launchSelected() {
        if (this._tiles[this._index]) this._launch(this._tiles[this._index].item);
    }

    _launch(item) {
        this._hide();
        try {
            const app = this._apps.lookup_app(item.id);
            if (app) app.activate();
            else item.info.launch([],null);
        } catch (error) {
            console.error('[Nova Launcher] Could not launch ' + item.id,error);
        }
    }

    _toggle() { if (this._visible) this._hide(); else this._show(); }

    _show() {
        if (this._visible || Main.sessionMode.isLocked || Main.sessionMode.isGreeter)
            return;
        if (Main.overview.visible) Main.overview.hide();
        this._tab = 'All';
        this._search.set_text('');
        this._index = 0;
        this._position();
        this._render();
        this._layer.show();
        this._grab = Main.pushModal(this._layer, {actionMode:Shell.ActionMode.POPUP});
        if (!this._grab || this._grab.get_windowing_state() === Clutter.GrabState.NONE) {
            if (this._grab) Main.popModal(this._grab);
            this._grab = null;
            this._layer.hide();
            console.warn('[Nova Launcher] Unable to grab popup input');
            return;
        }
        this._visible = true;
        this._panel.remove_all_transitions();
        this._panel.opacity = 0;
        this._panel.scale_x = 0.97;
        this._panel.scale_y = 0.97;
        this._panel.ease({
            opacity:255, scale_x:1, scale_y:1,
            duration:this._settings.get_int('animation-duration'),
            mode:Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._search.grab_key_focus();
    }

    _hide() {
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        this._visible = false;
        this._panel?.remove_all_transitions();
        this._layer?.hide();
    }

    _bindShortcut() {
        Main.wm.removeKeybinding('toggle-shortcut');
        if (!this._settings.get_strv('toggle-shortcut').length) return;
        try {
            Main.wm.addKeybinding(
                'toggle-shortcut',this._settings,Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
                () => this._toggle());
        } catch (error) {
            console.error('[Nova Launcher] Shortcut unavailable',error);
        }
    }

    _configureSuper() {
        this._restoreSuper();
        if (!this._settings.get_boolean('use-super')) return;
        // Opt in only. Never change Mutter's persistent overlay-key setting.
        const signalId = GObject.signal_lookup('overlay-key',global.display.constructor);
        if (!signalId) return;
        const original = GObject.signal_handler_find(global.display,{signalId});
        if (!original) return;
        try {
            global.display.block_signal_handler(original);
            this._originalOverlayId = original;
            this._overlayId = global.display.connect('overlay-key',() => this._toggle());
        } catch (error) {
            console.error('[Nova Launcher] Super override error',error);
            this._restoreSuper();
        }
    }

    _restoreSuper() {
        if (this._overlayId) {
            global.display.disconnect(this._overlayId);
            this._overlayId = 0;
        }
        if (this._originalOverlayId) {
            if (GObject.signal_handler_is_connected(
                global.display,this._originalOverlayId))
                global.display.unblock_signal_handler(this._originalOverlayId);
            this._originalOverlayId = 0;
        }
    }
}
