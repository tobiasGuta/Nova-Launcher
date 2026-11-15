import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const KEYS = [
    ['Super + Shift + P','<Super><Shift>p'],
    ['Ctrl + Alt + Space','<Control><Alt>space'],
    ['Disabled',''],
];

export default class NovaLauncherPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({
            title:'Nova Launcher', icon_name:'view-app-grid-symbolic',
        });
        window.add(page);
        const keyboard = new Adw.PreferencesGroup({title:'Keyboard'});
        page.add(keyboard);
        const combo = new Adw.ComboRow({
            title:'Toggle shortcut',
            subtitle:'Start with this before enabling Super-only mode',
            model:Gtk.StringList.new(KEYS.map(([name]) => name)),
        });
        const active = settings.get_strv('toggle-shortcut')[0] || '';
        const index = KEYS.findIndex(([,value]) => value === active);
        combo.selected = index < 0 ? 0 : index;
        combo.connect('notify::selected',() => {
            const value = KEYS[combo.selected]?.[1] || '';
            settings.set_strv('toggle-shortcut',value ? [value] : []);
        });
        keyboard.add(combo);

        const superRow = new Adw.SwitchRow({
            title:'Use Super alone (experimental)',
            subtitle:'Overrides GNOME overview only while this extension is enabled',
            active:settings.get_boolean('use-super'),
        });
        superRow.connect('notify::active',() =>
            settings.set_boolean('use-super',superRow.active));
        keyboard.add(superRow);

        const appearance = new Adw.PreferencesGroup({title:'Appearance'});
        page.add(appearance);
        this._number(appearance,settings,'window-width','Launcher width',
            'Maximum width in logical pixels',520,1100,20);
        this._number(appearance,settings,'columns','Preferred columns',
            'Reduced automatically on narrow screens',3,8,1);
        this._number(appearance,settings,'icon-size','Application icon size',
            'Size in logical pixels',36,80,4);
        this._number(appearance,settings,'animation-duration','Opening animation',
            'Milliseconds; set to zero to disable',0,400,20);
    }

    _number(group,settings,key,title,subtitle,min,max,step) {
        const row = new Adw.SpinRow({
            title,subtitle,
            adjustment:new Gtk.Adjustment({
                lower:min,upper:max,step_increment:step,
                page_increment:step*5,value:settings.get_int(key),
            }),
        });
        row.connect('notify::value',() => {
            const number = Math.round(row.value);
            if (number !== settings.get_int(key))
                settings.set_int(key,number);
        });
        group.add(row);
    }
}
