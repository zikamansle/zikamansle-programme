#!/usr/bin/env bash
set -euo pipefail

APK="android-native/app/build/outputs/apk/debug/app-debug.apk"
test -s "$APK" || { echo "Missing debug APK: $APK"; exit 1; }
adb install -r "$APK"
adb logcat -c
adb shell am start -W -n fr.zikamansle.app.debug/fr.zikamansle.app.ZikaLauncherActivity | tee /tmp/zika-launch.txt
grep -q "Status: ok" /tmp/zika-launch.txt

# Do not consent to test push notifications or register an emulator device.
sleep 5
adb shell uiautomator dump /sdcard/window.xml >/dev/null || true
adb shell cat /sdcard/window.xml > /tmp/zika-ui.xml || true
python3 - <<'PY'
import re
import subprocess
from pathlib import Path

path=Path('/tmp/zika-ui.xml')
ui=path.read_text(errors='replace') if path.exists() else ''
match=re.search(r'text="Plus tard"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', ui)
if match:
    x1,y1,x2,y2=map(int,match.groups())
    subprocess.run(['adb','shell','input','tap',str((x1+x2)//2),str((y1+y2)//2)],check=True)
    print('Notification consent declined for emulator startup test')
PY

sleep 10
adb logcat -d -v threadtime > /tmp/zika-android-logcat.txt
if grep -A 25 'FATAL EXCEPTION' /tmp/zika-android-logcat.txt | grep -Eq 'fr[.]zikamansle[.]app|ManageDataLauncherActivity'; then
    echo 'FAIL: ZikaMansle Android crashed during startup'
    exit 1
fi
if grep -E 'FATAL EXCEPTION|Unable to start activity|ClassNotFoundException' /tmp/zika-android-logcat.txt | grep -Eq 'Zika|ManageDataLauncherActivity'; then
    echo 'FAIL: ZikaMansle component could not start'
    exit 1
fi
echo 'PASS: ZikaMansle launcher returned success without detected Android crash'
