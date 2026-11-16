// Read-only ZikaTeam production smoke test. Does not authenticate or change data.
const base = 'https://app.zikamansle.fr';
async function fetchText(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(base + path, { redirect: 'follow', cache: 'no-store', signal: controller.signal, headers: { 'User-Agent': 'ZikaTeam-Regression-Guard/1.0' } });
    const text = await res.text();
    return { status: res.status, type: res.headers.get('content-type') ?? '', text };
  } finally { clearTimeout(timeout); }
}
function ensure(condition, message) { if (!condition) throw new Error(message); }
const page = await fetchText('/zikateam?healthcheck=1');
ensure(page.status === 200, 'ZikaTeam page unavailable: ' + page.status);
ensure(page.text.includes('id="teamRoot"'), 'ZikaTeam application root disappeared');
ensure(page.text.includes('zikateam.js'), 'ZikaTeam frontend script disappeared');
ensure(page.text.includes('__zikaMobileTabs'), 'Historic ZikaTeam navigation enhancement missing');
ensure(page.text.includes('__zikaMuteV2'), 'ZikaTeam chat notification preferences script missing');
ensure(page.text.includes('zika-home-clarity-css'), 'ZikaTeam home dashboard styling missing');
const js = await fetchText('/zikateam.js?healthcheck=1');
ensure(js.status === 200, 'ZikaTeam JavaScript unavailable: ' + js.status);
ensure(!/<!doctype html/i.test(js.text.slice(0, 200)), 'HTML returned instead of JavaScript');
for (const fragment of ['function menu()', 'function management()', 'function render()', 'function manageMembers()', 'function manageActivities()', 'function manageAttendance()', 'function messages()']) {
  ensure(js.text.includes(fragment), 'Missing core ZikaTeam function: ' + fragment);
}
const api = await fetchText('/zikateam/api/manage');
ensure(api.status !== 200, 'Protected ZikaTeam management endpoint unexpectedly accessible without login');
ensure(!/<!doctype html/i.test(api.text.slice(0, 200)), 'Management API returned HTML instead of an auth error');
console.log('PASS: historical ZikaTeam frontend, modules and protected API are present.');
console.log('NOTE: this is NOT a logged-in functional test. A full administrator acceptance test is still required.');
