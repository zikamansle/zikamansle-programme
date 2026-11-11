"""Inspect an Android emulator startup. Does not open or log private Firebase data."""
from pathlib import Path
import re

log = Path("android-startup-log.txt").read_text(errors="replace")
activities = Path("android-startup-activity.txt").read_text(errors="replace")

# The native package can exit after handing a Trusted Web Activity to Chrome.
# Its process ID need not persist after a successful handoff.
fatal = re.search(
    r"FATAL EXCEPTION.{0,2000}Process: fr\\.zikamansle\\.app\\.debug",
    log,
    re.S,
)
if fatal:
    raise SystemExit("FAIL: ZikaMansle Android crashes during startup")
if "Native push initialization failed" in log:
    raise SystemExit("FAIL: Firebase initialization errors at startup")
if not any(
    package in activities
    for package in ("fr.zikamansle.app.debug", "com.android.chrome", "org.chromium")
):
    raise SystemExit("FAIL: No ZikaMansle or browser activity in Android task stack")
print("PASS: Android debug app launched, no fatal crash, no Firebase initialization error.")
print("PASS: App/browser activity present after launch.")
print("Native notification delivery is not yet proven by this startup check.")
