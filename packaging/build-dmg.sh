#!/bin/sh
# Builds Desktop Habitats for this Mac's architecture and packages it into the disk image
# that ships it: the app, a shortcut to the Applications folder, and a Chinese readme.
#
# The app bundle gets the same layout `wallpaper/install.sh` produces, so the two ways of
# installing it are the same app. Everything generated lands in build/, which is not tracked.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
here="$root/packaging"
stage="$root/build/stage"
app="$stage/Desktop Habitats.app"
plist="$root/wallpaper/Info.plist"
version=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$plist")
dmg="$root/build/Desktop-Habitats-$version.dmg"

# dmgbuild is the one tool here that is not part of a stock macOS toolchain. It writes the
# image's .DS_Store itself, which is what keeps the window layout off Finder automation.
python=${PYTHON:-python3}
if ! "$python" -c "import dmgbuild" >/dev/null 2>&1; then
	echo "dmgbuild is missing. Install it with: $python -m pip install dmgbuild" >&2
	echo "Set PYTHON to an interpreter that already has it to use another one." >&2
	exit 1
fi

echo "==> artwork"
mkdir -p "$root/build"
swiftc -O -o "$root/build/artwork" "$root/wallpaper/artwork.swift" -framework AppKit
"$root/build/artwork" icon "$root/build/AppIcon.iconset" "$root/wallpaper/AppIcon.icns"
"$root/build/artwork" background "$here/dmg-background.png"

echo "==> compiling for $(uname -m)"
rm -rf "$stage"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/scene/scenes"
swiftc -O -target "$(uname -m)-apple-macos13.0" -o "$app/Contents/MacOS/Desktop Habitats" \
	"$root/wallpaper/Wallpaper.swift" \
	-framework Cocoa -framework WebKit -framework IOKit -framework ServiceManagement

echo "==> assembling the app bundle"
cp "$plist" "$app/Contents/Info.plist"
cp "$root/wallpaper/AppIcon.icns" "$app/Contents/Resources/AppIcon.icns"
cp -R "$root/wallpaper/en.lproj" "$root/wallpaper/zh-Hans.lproj" \
	"$app/Contents/Resources/"
# No trailing slash on the source: with one, cp copies the directory's contents.
for scene in "$root"/scenes/*; do
	cp -R "$scene" "$app/Contents/Resources/scene/scenes/"
done
cp -R "$root/vendor" "$root/ui" "$app/Contents/Resources/scene/"
rm -rf "$app"/Contents/Resources/scene/scenes/*/tests
plutil -lint "$app/Contents/Info.plist" >/dev/null

# Ad-hoc: there is no Developer ID here, and macOS only refuses to launch an arm64 binary
# that carries no signature at all. Anyone else's Mac will need the quarantine attribute
# cleared once (right click > Open), which is what an unnotarized build always costs.
codesign --force --deep --sign - "$app"
codesign --verify --strict "$app"

echo "==> mounting the disk image"
rm -f "$dmg"
"$python" -m dmgbuild -s "$here/dmg-settings.py" -D "here=$here" -D "app=$app" \
	"Desktop Habitats" "$dmg"

echo
echo "==> $dmg"
ls -lh "$dmg"
