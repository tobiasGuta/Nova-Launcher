#!/usr/bin/env bash
set -euo pipefail

UUID="nova-launcher@tobiasguta.github.io"
SOURCE="$(cd -- "$(dirname -- "$0")" && pwd)"
TARGET="$HOME/.local/share/gnome-shell/extensions/$UUID"

if ! command -v gnome-extensions >/dev/null 2>&1; then
    echo "GNOME Shell extensions utility is required." >&2
    exit 1
fi
if ! command -v glib-compile-schemas >/dev/null 2>&1; then
    echo "glib-compile-schemas is required." >&2
    exit 1
fi

mkdir -p "$TARGET/lib" "$TARGET/schemas"
for file in extension.js prefs.js stylesheet.css metadata.json; do
    install -m 0644 "$SOURCE/$file" "$TARGET/$file"
done
install -m 0644 "$SOURCE/lib/catalog.js" "$TARGET/lib/catalog.js"
install -m 0644 \
    "$SOURCE/schemas/org.gnome.shell.extensions.nova-launcher.gschema.xml" \
    "$TARGET/schemas/org.gnome.shell.extensions.nova-launcher.gschema.xml"
glib-compile-schemas --strict "$TARGET/schemas"

echo "Nova Launcher installed at: $TARGET"
echo "For Wayland: log out and back in; then run:"
echo "  gnome-extensions enable $UUID"
echo "Default shortcut: Super + Shift + P"
echo "GNOME Super is unchanged until you explicitly enable the experimental option."
