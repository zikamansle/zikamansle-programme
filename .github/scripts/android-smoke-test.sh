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
adb shell screencap -p /sdcard/zika-screen.png >/dev/null || true
adb pull /sdcard/zika-screen.png /tmp/zika-screen.png >/dev/null || true
python3 - <<'PY'
import re
import subprocess
import time
from pathlib import Path
from xml.etree import ElementTree as ET

def ui_dump():
    subprocess.run(['adb','shell','uiautomator','dump','/sdcard/window.xml'],
                   stdout=subprocess.DEVNULL,check=False)
    result=subprocess.run(['adb','shell','cat','/sdcard/window.xml'],
                          capture_output=True,text=True)
    try:
        return ET.fromstring(result.stdout)
    except ET.ParseError:
        return None

def is_prompt(root):
    return root is not None and any(
        'Notifications ZikaMansle' in n.attrib.get('text','')
        for n in root.iter('node'))

def click_approve(root):
    buttons=[n for n in root.iter('node')
             if n.attrib.get('text','').strip().casefold()=='activer']
    if not buttons:
        buttons=[n for n in root.iter('node')
                 if n.attrib.get('resource-id','').endswith(':id/button1')]
    if not buttons: raise SystemExit('FAIL: Android notification approval button absent')
    bounds=buttons[0].attrib.get('bounds','')
    m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',bounds)
    if not m: raise SystemExit('FAIL: Notification approval button has invalid bounds')
    x1,y1,x2,y2=map(int,m.groups())
    subprocess.run(['adb','shell','input','tap',str((x1+x2)//2),str((y1+y2)//2)],
                   check=True)

root=None
for attempt in range(6):
    root=ui_dump()
    if root is not None and any(n.attrib.get('text') for n in root.iter('node')):
        break
    time.sleep(2)
if root is None:
    raise SystemExit('FAIL: Android UI never became available after startup')
if is_prompt(root):
    click_approve(root)
    print('PASS: Activer notifications selected in the ZikaMansle app')
    time.sleep(2)
    for attempt in range(5):
        root=ui_dump()
        if root is not None and not is_prompt(root): break
        time.sleep(2)
    else:
        raise SystemExit('FAIL: Notifications consent dialog stayed open after Activer')
else:
    texts=[n.attrib.get('text','') for n in root.iter('node') if n.attrib.get('text','')]
    if len(texts)<3: raise SystemExit('FAIL: Android UI missing or incomplete')
    print('No first-run notification dialog; normal app UI available')
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
if ! grep -q 'ZIKA_WEBVIEW_PAGE_FINISHED host=zikamansle-app-staging.zikamansle.workers.dev' /tmp/zika-android-logcat.txt; then
    echo 'FAIL: The unified ZikaMansle test app did not finish loading the integrated staging site'
    grep -F 'ZikaMansle' /tmp/zika-android-logcat.txt | tail -20 || true
    exit 1
fi
echo 'PASS: The unified ZikaMansle staging app is visible after notification consent'
if grep -A 25 'FATAL EXCEPTION' /tmp/zika-android-logcat.txt | grep -Eq 'fr[.]zikamansle[.]app|ManageDataLauncherActivity'; then
    echo 'FAIL: ZikaMansle Android crashed during startup'
    exit 1
fi
if grep -E 'FATAL EXCEPTION|Unable to start activity|ClassNotFoundException' /tmp/zika-android-logcat.txt | grep -Eq 'Zika|ManageDataLauncherActivity'; then
    echo 'FAIL: ZikaMansle component could not start'
    exit 1
fi
echo 'PASS: ZikaMansle launcher returned success without detected Android crash'

# The protected ZikaTeam section must be reached through the existing Plus
# menu of the SAME ZikaMansle app. Do not accept a second Android tab.
adb shell uiautomator dump /sdcard/zika-home-ui.xml >/dev/null || true
adb shell cat /sdcard/zika-home-ui.xml > /tmp/zika-home-ui.xml || true
python3 - <<'PY'
from pathlib import Path
from xml.etree import ElementTree as ET
import re
import subprocess
p=Path('/tmp/zika-home-ui.xml')
root=ET.fromstring(p.read_text(errors='replace'))
nodes=[n for n in root.iter('node') if n.attrib.get('text','').strip().casefold()=='plus']
if nodes:
    bounds=nodes[-1].attrib.get('bounds','')
    m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds)
    if not m: raise SystemExit('FAIL: Plus menu has invalid bounds')
    x1,y1,x2,y2=map(int,m.groups())
    x,y=(x1+x2)//2,(y1+y2)//2
else:
    # Android WebView text is sometimes not exposed to UIAutomator.
    # The actual ZikaMansle UI has Plus in its bottom-right navigation.
    out=subprocess.check_output(['adb','shell','wm','size'],text=True)
    m=re.search(r'(\d+)x(\d+)',out)
    if not m: raise SystemExit('FAIL: Cannot determine emulator screen dimensions')
    width,height=map(int,m.groups())
    x,y=round(width*0.875),round(height*0.945)
subprocess.run(['adb','shell','input','tap',str(x),str(y)],check=True)
print('PASS: Opened the existing Plus menu')
PY
sleep 4
adb shell uiautomator dump /sdcard/zika-plus-ui.xml >/dev/null || true
adb shell cat /sdcard/zika-plus-ui.xml > /tmp/zika-plus-ui.xml || true
adb shell screencap -p /sdcard/zika-plus-screen.png >/dev/null || true
adb pull /sdcard/zika-plus-screen.png /tmp/zika-plus-screen.png >/dev/null || true
# Exercise the actual on/off buttons on the Actualités & notifications page,
# not merely the first-launch Android notification permission dialog.
# We are already in Plus; validate Actualités before opening private ZikaTeam.
python3 - <<'PY'
import re,subprocess,time
from pathlib import Path
from xml.etree import ElementTree as ET

def dump():
    subprocess.run(['adb','shell','uiautomator','dump','/sdcard/zika-current.xml'],
        stdout=subprocess.DEVNULL,check=False)
    raw=subprocess.check_output(['adb','shell','cat','/sdcard/zika-current.xml'],text=True)
    Path('/tmp/zika-news-ui.xml').write_text(raw)
    subprocess.run(['adb','shell','screencap','-p','/sdcard/zika-news-screen.png'],stdout=subprocess.DEVNULL,check=False)
    subprocess.run(['adb','pull','/sdcard/zika-news-screen.png','/tmp/zika-news-screen.png'],stdout=subprocess.DEVNULL,check=False)
    return ET.fromstring(raw)

def find(root,needle):
    return [n for n in root.iter('node') if needle.lower() in n.attrib.get('text','').lower()
        and n.attrib.get('bounds')!='[0,0][0,0]']

def tap(node):
    m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',node.attrib.get('bounds',''))
    if not m: raise SystemExit('FAIL: cannot tap element '+repr(node.attrib.get('text')))
    x1,y1,x2,y2=map(int,m.groups())
    subprocess.run(['adb','shell','input','tap',str((x1+x2)//2),str((y1+y2)//2)],check=True)

root=dump()
news=find(root,'Actualités & notifications')
if not news: raise SystemExit('FAIL: Actualités & notifications entry missing from Plus')
tap(news[0]);time.sleep(5)
for attempt in range(7):
    root=dump()
    enable=find(root,'Activer les notifications')
    disable=find(root,'Désactiver les notifications')
    if enable and disable:break
    subprocess.run(['adb','shell','input','swipe','160','520','160','205','400'],check=True)
    time.sleep(2)
else:
    raise SystemExit('FAIL: Native Activer/Désactiver controls not present in Actualités')
print('PASS: Both Activer and Désactiver buttons are available in Actualités')

tap(disable[0]);time.sleep(2)
root=dump()
confirm=find(root,'Désactiver')
if not confirm:raise SystemExit('FAIL: Disable confirmation dialog absent')
# Prefer native positive button resource id (not the underlying WebView button).
positive=[n for n in root.iter('node') if n.attrib.get('resource-id','').endswith(':id/button1')]
if not positive:raise SystemExit('FAIL: Native disable confirmation missing')
tap(positive[0]);time.sleep(3)
root=dump()
if not find(root,'Notifications désactivées'):
    raise SystemExit('FAIL: Notification-off state not displayed')
print('PASS: Désactiver really updates Android native push state')

enable=find(root,'Activer les notifications')
if not enable: raise SystemExit('FAIL: Enable button missing after disabling')
tap(enable[0]);time.sleep(5)
root=dump()
if not find(root,'Notifications activées'):
    raise SystemExit('FAIL: Notification-on state not displayed')
print('PASS: Activer restores the Android native notification opt-in')
# Return to the existing Plus menu to continue the unchanged ZikaTeam test.
out=subprocess.check_output(['adb','shell','wm','size'],text=True)
dims=re.search(r'(\d+)x(\d+)',out)
if not dims:raise SystemExit('FAIL: Screen dimensions missing')
width,height=map(int,dims.groups())
subprocess.run(['adb','shell','input','tap',str(round(width*0.875)),str(round(height*0.945))],check=True)
time.sleep(4)
if not find(dump(),'ZikaTeam'):
    raise SystemExit('FAIL: Could not return to Plus from Actualités')
PY

python3 - <<'PY'
from pathlib import Path
from xml.etree import ElementTree as ET
import re
import subprocess
root=ET.fromstring(Path('/tmp/zika-plus-ui.xml').read_text(errors='replace'))
nodes=[n for n in root.iter('node') if 'zikateam' in n.attrib.get('text','').casefold()]
if len(nodes)>1:
    raise SystemExit('FAIL: Duplicate ZikaTeam menu items found: '+repr([n.attrib.get('text') for n in nodes]))
install=[n.attrib.get('text','') for n in root.iter('node')
         if n.attrib.get('text','').strip().casefold().startswith(('installer l', 'installer zika', 'installer maintenant'))]
if install:
    raise SystemExit('FAIL: PWA install buttons still visible inside Android: '+repr(install))
print('PASS: Only one ZikaTeam entry, no redundant Install button in Plus menu')
if not nodes:
    visible=[(n.attrib.get('text',''),n.attrib.get('content-desc','')) for n in root.iter('node') if n.attrib.get('text','').strip() or n.attrib.get('content-desc','').strip()]
    raise SystemExit('FAIL: ZikaTeam missing from Plus menu. Visible nodes: '+repr(visible[-30:]))
bounds=nodes[0].attrib.get('bounds','')
m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds)
if not m: raise SystemExit('FAIL: ZikaTeam menu entry cannot be clicked')
x1,y1,x2,y2=map(int,m.groups())
subprocess.run(['adb','shell','input','tap',str((x1+x2)//2),str((y1+y2)//2)],check=True)
print('PASS: Opened ZikaTeam as an existing app menu section')
PY
sleep 18
adb shell dumpsys activity activities > /tmp/zika-team-activity.txt
adb logcat -d -v threadtime > /tmp/zika-team-logcat.txt
if ! grep -E '(topResumedActivity|mResumedActivity|ResumedActivity)' /tmp/zika-team-activity.txt | grep -q 'ZikaWebActivity'; then
    echo 'FAIL: ZikaTeam left the installed ZikaMansle app'
    exit 1
fi
if ! grep -q 'ZIKA_TEAM_CONTENT_READY' /tmp/zika-team-logcat.txt; then
    echo 'FAIL: ZikaTeam private interface not loaded inside ZikaMansle'
    grep -E 'ZIKA_TEAM_CONTENT|ZIKA_WEBVIEW_PAGE_FINISHED' /tmp/zika-team-logcat.txt | tail -15 || true
    exit 1
fi
echo 'PASS: Festival and private ZikaTeam section load in one ZikaMansle app'


