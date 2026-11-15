# Nova Launcher

Nova Launcher is a native floating app launcher for Fedora with GNOME Shell 51.1 on Wayland. It runs independently of the [Nova](https://github.com/tobiasGuta/N-va) panel extension.

## Install or update

From the repository root, run the installer as your regular user.

```sh
bash ./install.sh
```

Log out of GNOME and back in to load the installed code. On a first install, enable Nova Launcher in the Extensions app or run the following command.

```sh
gnome-extensions enable nova-launcher@tobiasguta.github.io
```

To update an existing installation, pull the latest changes, run the installer again, then log out and back in. Preferences persist across updates.

## Use the launcher

| Action | Control |
| --- | --- |
| Open or close | **Super + Shift + P** |
| Search by app name, description, or desktop-entry keywords | Start typing |
| Move from search into the grid | **Down** |
| Move between app tiles | Arrow keys |
| Launch the focused app or first search result | **Enter** |
| Dismiss | **Escape** or click outside |

Nova opens in the active monitor’s work area. The default view starts with GNOME Favorites in dock order, followed by the rest of the app library alphabetically. Category buttons filter the grid. The scrollbar appears when the pointer enters its gutter and stays visible while you drag it.

## Preferences

Open Nova Launcher’s settings in the Extensions app or run the following command.

```sh
gnome-extensions prefs nova-launcher@tobiasguta.github.io
```

- **Toggle shortcut** selects the default **Super + Shift + P**, **Ctrl + Alt + Space**, or **Disabled**.
- **Use Super alone (experimental)** makes a tap of **Super** toggle Nova in place of the GNOME Overview. It defaults to off. Turn it off if another extension manages Super.
- **Frosted glass** blurs the desktop behind the panel. High-contrast mode uses a solid panel automatically.
- **Launcher width**, **Preferred columns**, **Application icon size**, and **Opening animation** let you adjust the grid. Nova uses fewer columns when space is tight and honors GNOME’s reduced-motion setting.

## Troubleshooting

If GNOME is still running an older copy after an update, log out and back in. To inspect Shell errors, run the following command.

```sh
journalctl --user -b /usr/bin/gnome-shell --no-pager --grep='nova.launcher|Nova Launcher'
```

To disable Nova Launcher and restore GNOME’s normal Super behavior, use the Extensions app or run the following command.

```sh
gnome-extensions disable nova-launcher@tobiasguta.github.io
```

GNOME 51.1 on Wayland is the tested target. The launcher has been smoke-tested with virtual monitors and alongside Nova, Dash to Dock, and Blur my Shell. Fullscreen behavior and fractional scaling still need desktop testing.

## Development

Run the same checks as GitHub Actions with Node.js 20+ and `glib-compile-schemas` installed.

```sh
npm run check
bash -n install.sh
glib-compile-schemas --strict --dry-run schemas/
python3 -m json.tool metadata.json >/dev/null
```

- `extension.js` implements the Shell UI, input handling, and app activation.
- `lib/catalog.js` implements filtering, favorites, and column sizing.
- `stylesheet.css` styles the Shell UI, and `prefs.js` defines the libadwaita settings.
- `schemas/` defines GSettings defaults, and `tests/` covers catalog and layout logic.

No license has been selected by the repository owner yet.
