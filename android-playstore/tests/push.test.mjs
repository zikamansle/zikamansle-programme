import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Node.js 22: simulate the Service Worker without browser/network.
const script = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
function worker() {
  const handlers = {}, displayed = [], opened = [];
  const self = {
    location: { href: 'https://app.zikamansle.fr/sw.js' },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    registration: { showNotification: async (title, options) => { displayed.push({ title, options }); } },
    clients: {
      matchAll: async () => [],
      openWindow: async url => { opened.push(url); return { url }; }
    }
  };
  vm.runInNewContext(script, { self, URL, caches: {}, Response }, { filename: 'sw.js' });
  return { handlers, displayed, opened, self };
}
async function run(handler, properties) {
  let promise;
  handler({ ...properties, waitUntil: result => { promise = result; } });
  assert.ok(promise, 'service worker must call waitUntil');
  await promise;
}
test('push displays title and festival URL', async () => {
  const { handlers, displayed } = worker();
  await run(handlers.push, { data: { json: () => ({ title: 'ZikaMansle', body: 'Parade', url: '/plan.html' }) } });
  assert.equal(displayed.length, 1);
  assert.equal(displayed[0].options.body, 'Parade');
  assert.equal(displayed[0].options.data.url, 'https://app.zikamansle.fr/plan.html');
});
test('external URLs in push and clicks are rejected', async () => {
  const { handlers, displayed, opened } = worker();
  await run(handlers.push, { data: { json: () => ({ title: 'Info', url: 'https://example.org/' }) } });
  assert.equal(displayed[0].options.data.url, 'https://app.zikamansle.fr/index.html');
  await run(handlers.notificationclick, {
    notification: { data: { url: 'https://example.org/' }, close: () => {} }
  });
  assert.deepEqual(opened, ['https://app.zikamansle.fr/index.html']);
});
test('click focuses a pre-existing window', async () => {
  const { handlers, self } = worker();
  let navigated = '', focused = false;
  self.clients.matchAll = async () => [{
    url: 'https://app.zikamansle.fr/index.html',
    navigate: async url => { navigated = url; },
    focus: async () => { focused = true; }
  }];
  await run(handlers.notificationclick, {
    notification: { data: { url: '/index.html#programme' }, close: () => {} }
  });
  assert.equal(navigated, 'https://app.zikamansle.fr/index.html#programme');
  assert.equal(focused, true);
});
