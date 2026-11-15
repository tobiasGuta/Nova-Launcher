# Nova Launcher

A native, customizable floating application launcher for Fedora GNOME Shell 51, designed to run independently alongside [Nova](https://github.com/tobiasGuta/N-va).

**v0.1 development preview — GNOME Shell 51.1 + Wayland target.**

## Features

- Rounded, translucent app grid over your wallpaper, with a dim backdrop.
- GNOME desktop-file discovery and application activation, without hardcoded app names.
- Search by name and description; category tabs (All, Development, Internet, Utilities, Graphics, Games, Other).
- Escape to close; arrow keys to select; Enter to launch; click an app to open it.
- Adjustable width, column count, icon size and opening animation from native GTK4/libadwaita preferences.
- Opens centered on the current monitor and limits initial rendering to 72 apps to keep GNOME Shell responsive.
- Regular shortcut **Super + Shift + P**, enabled by default.
- Optional **experimental Super-only** interception, disabled by default. It blocks an existing overlay-key signal handler for the running GNOME session and unblocks it when disabled. The extension does **not** persistently edit Mutter settings.
- User-local installation; no root privileges, external processes or changes to the companion Nova extension.

The panel uses translucency, **not genuine background blur**. The experimental Super interception is not tested on the user's desktop and can conflict with extensions that modify the same signal. Do not enable other Super-remapping extensions at the same time.

## Install on Fedora

Verify your session:

    echo "$XDG_CURRENT_DESKTOP"
    gnome-shell --version
    echo "$XDG_SESSION_TYPE"

Clone and install:

    git clone https://github.com/tobiasGuta/Nova-Launcher.git
    cd Nova-Launcher
    bash ./install.sh

**Log out and log in again** on Wayland, then enable:

    gnome-extensions enable nova-launcher@tobiasguta.github.io

Press **Super + Shift + P**. Check searching, clicking an app, category switching and Escape first.

Customize settings:

    gnome-extensions prefs nova-launcher@tobiasguta.github.io

Only after ordinary shortcut testing, optionally turn on **Use Super alone (experimental)** in Preferences. If it misbehaves, disable that preference or the extension, and log out/in for a clean Shell reset.

## Rollback and troubleshooting

Disable just this extension:

    gnome-extensions disable nova-launcher@tobiasguta.github.io

This does not disable Nova, Dash to Dock, Blur my Shell, or any other GNOME extensions. The extension normally unblocks GNOME's original overlay-key handler when disabled. Logging out/in resets any in-process signal changes if Shell cleanup was interrupted.

To remove the files:

    rm -r "$HOME/.local/share/gnome-shell/extensions/nova-launcher@tobiasguta.github.io"

For GNOME errors:

    journalctl --user -b /usr/bin/gnome-shell --no-pager | grep -i 'nova.launcher\|Nova Launcher'

For pure JavaScript tests (Node.js 20+):

    npm run check

For the GSettings schema:

    glib-compile-schemas --strict --dry-run schemas/

After editing extension JavaScript on Wayland, log out/in rather than attempting an in-place GNOME Shell restart.

## Project layout

- extension.js — native Shell UI, modal popup, app activation, keybindings and Super interception.
- lib/catalog.js — filter and grid layout logic.
- prefs.js — GTK4 / libadwaita settings.
- stylesheet.css — independent launcher styling.
- schemas/ — user-local GSettings.
- tests/ — Node.js catalog unit tests.
- install.sh — reversible local installation.
- .github/workflows/ci.yml — syntax, tests and schema validation.

## Limitations

This is a **first prototype**, not a production-tested GNOME extension. Live testing is still required for modal focus, Super-only behavior, multi-monitor positioning, long app names, accessibility and interactions with Nova, Dash to Dock and Blur my Shell. The app grid uses a 72-result display cap; narrow searches to access more. Arrow selection doesn't auto-scroll yet. Category accuracy depends on desktop-file metadata. True blur, favorites, drag and drop, more keyboard configuration and rich appearance settings remain planned.

No license has been selected by the repository owner yet.
