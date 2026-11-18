#!/usr/bin/env bash
# Baut die Android-APK (Capacitor) aus den aktuellen Web-Dateien und legt sie in Google Drive ab.
# Voraussetzungen (einmalig eingerichtet): JDK 17 in ~/.local/jdk-17*, Android SDK in ~/Android/Sdk,
# Signierschlüssel in ~/Android/keys (Passwort in rechenwerk-schluessel.txt – nicht löschen!).
set -euo pipefail
cd "$(dirname "$0")"

export JAVA_HOME=$(ls -d ~/.local/jdk-17* | head -1)
export ANDROID_HOME=~/Android/Sdk
export PATH="$JAVA_HOME/bin:$PATH"
# Googles Server liefert hier über IPv4 404 – Java deshalb auf IPv6
export JAVA_TOOL_OPTIONS="-Djava.net.preferIPv6Addresses=true"

VERSION_CODE=${1:-$(( $(date +%s) / 60 ))}   # Minuten seit 1970: steigt bei jedem Build
BT=$ANDROID_HOME/build-tools/34.0.0
OUT=android-build/android/app/build/outputs/apk/release
DRIVE="$HOME/Google Drive/Rechenwerk"

cp index.html app.js calc.js style.css sw.js manifest.webmanifest icon.svg icon-*.png android-build/www/
python3 -I make-icons.py android-build/android/app/src/main/res
(cd android-build && npx cap sync android >/dev/null)
sed -i "s/versionCode [0-9]*/versionCode $VERSION_CODE/" android-build/android/app/build.gradle
(cd android-build/android && ./gradlew --no-daemon -q assembleRelease)

PW=$(sed -n 's/^Passwort: //p' ~/Android/keys/rechenwerk-schluessel.txt)
"$BT/zipalign" -f -p 4 "$OUT/app-release-unsigned.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks ~/Android/keys/rechenwerk.jks --ks-key-alias rechenwerk \
  --ks-pass "pass:$PW" --key-pass "pass:$PW" --out "$OUT/Rechenwerk.apk" "$OUT/aligned.apk"

mkdir -p "$DRIVE"
cp "$OUT/Rechenwerk.apk" "$DRIVE/Rechenwerk.apk"
echo "Fertig: $DRIVE/Rechenwerk.apk (versionCode $VERSION_CODE)"
