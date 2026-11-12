#!/usr/bin/env bash
set -euo pipefail

APK="android-native/app/build/outputs/apk/debug/app-debug.apk"
test -s "$APK" || { echo "Missing debug APK: $APK"; exit 1; }
adb install -r "$APK"
# Pre-grant the Android notification permission to exercise the application's
# explicit 'Activer' button and Firebase callback without an OS dialog race.
adb shell pm grant fr.zikamansle.app.debug android.permission.POST_NOTIFICATIONS
adb logcat -c
adb shell am start -W -n fr.zikamansle.app.debug/fr.zikamansle.app.ZikaLauncherActivity | tee /tmp/zika-launch.txt
grep -q "Status: ok" /tmp/zika-launch.txt

# The app is already open behind the optional notification dialog.
# Tap 'Activer' to exercise the path that failed on the real Android phone.
sleep 5
adb shell uiautomator dump /sdcard/window.xml >/dev/null || true
adb shell cat /sdcard/window.xml > /tmp/zika-ui.xml || true
python3 - <<'PY'
import re
import subprocess
from pathlib import Path
from xml.etree import ElementTree as ET

p=Path('/tmp/zika-ui.xml')
ui=p.read_text(errors='replace') if p.exists() else ''
if 'Notifications ZikaMansle' in ui:
    try:
        root=ET.fromstring(ui)
        buttons=[n for n in root.iter('node') if n.attrib.get('text','').strip()=='Activer']
        if not buttons:
            raise ValueError('Activer button not found in Android notification dialog')
        bounds=buttons[0].attrib.get('bounds','')
        match=re.fullmatch(r'\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]',bounds)
        if not match:
            raise ValueError('Activer button has no valid bounds')
        x1,y1,x2,y2=map(int,match.groups())
        subprocess.run(['adb','shell','input','tap',str((x1+x2)//2),str((y1+y2)//2)],check=True)
        print('PASS: Activer notifications selected in the ZikaMansle app')
    except (ET.ParseError, ValueError) as e:
        raise SystemExit('FAIL: cannot operate notification dialog: '+str(e))
else:
    print('No first-run notification dialog appeared, verifying app window directly')
PY

# The consent dialog must not be the end of the test: the in-app WebView
# must become the foreground Android activity after the user answers.
sleep 15
adb shell dumpsys activity activities > /tmp/zika-activity.txt
adb logcat -d -v threadtime > /tmp/zika-android-logcat.txt
if ! grep -E '(topResumedActivity|mResumedActivity|ResumedActivity)' /tmp/zika-activity.txt | grep -q 'ZikaWebActivity'; then
    echo 'FAIL: ZikaMansle integrated app is not in the foreground after notification consent'
    grep -E 'ZikaWebActivity|topResumedActivity|mResumedActivity' /tmp/zika-activity.txt | tail -15 || true
    exit 1
fi
if ! grep -q 'ZIKA_WEBVIEW_PAGE_FINISHED host=app.zikamansle.fr' /tmp/zika-android-logcat.txt; then
    echo 'FAIL: The integrated ZikaMansle app did not finish loading its official URL'
    grep -F 'ZikaMansle' /tmp/zika-android-logcat.txt | tail -20 || true
    exit 1
fi
echo 'PASS: The official ZikaMansle app is visible after the notification prompt'
if grep -A 25 'FATAL EXCEPTION' /tmp/zika-android-logcat.txt | grep -Eq 'fr[.]zikamansle[.]app|ManageDataLauncherActivity'; then
    echo 'FAIL: ZikaMansle Android crashed during startup'
    exit 1
fi
if grep -E 'FATAL EXCEPTION|Unable to start activity|ClassNotFoundException' /tmp/zika-android-logcat.txt | grep -Eq 'Zika|ManageDataLauncherActivity'; then
    echo 'FAIL: ZikaMansle component could not start'
    exit 1
fi
echo 'PASS: ZikaMansle launcher returned success without detected Android crash'
