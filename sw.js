const CACHE='zikamansle-app-v2';
const FILES=['index.html','plan.html','config.js','programme-initial.js','programme-ui.js','programme-ui.css','app.js','app.css','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','festival-scene.svg','festival-scene-static.svg'];
const base=new URL('./',self.location.href);
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new URL(f,base).href)))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('zikamansle-app-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data==='ACTIVATE_UPDATE')self.skipWaiting()});
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==base.origin||u.searchParams.get('studio')==='1')return;
 const relative=u.pathname.slice(base.pathname.length)||'index.html';
 if(!u.pathname.startsWith(base.pathname)||!FILES.includes(relative))return;
 const canonical=new URL(relative,base).href;
 e.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(e.request);if(response.ok)await cache.put(canonical,response.clone());return response}catch(error){return await cache.match(canonical)||Response.error()}})());
});


// Notifications du festival : réception + ouverture sécurisée.
// L'abonnement Web Push et la clé VAPID sont gérés séparément côté application/serveur.
const festivalNotificationUrl = value => {
  try {
    const requested = new URL(typeof value === 'string' ? value : './index.html', base);
    // Ne pas transformer une notification du festival en ouverture de lien externe.
    if (requested.origin !== base.origin || !requested.pathname.startsWith(base.pathname)) {
      return new URL('index.html', base).href;
    }
    return requested.href;
  } catch (_) {
    return new URL('index.html', base).href;
  }
};
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; }
  catch (_) { payload = { body: event.data?.text() || '' }; }
  const notification = payload.notification && typeof payload.notification === 'object'
    ? payload.notification : payload;
  const title = String(notification.title || 'ZikaMansle').slice(0, 100);
  const body = String(notification.body || 'Une nouvelle information sur le festival est disponible.').slice(0, 240);
  const url = festivalNotificationUrl(notification.url || notification.link || payload.url);
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: new URL('icons/icon-192.png', base).href,
    badge: new URL('icons/icon-192.png', base).href,
    tag: String(notification.tag || 'zikamansle-info').slice(0, 80),
    data: { url }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = festivalNotificationUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(client => {
      try { return new URL(client.url).origin === base.origin; }
      catch (_) { return false; }
    });
    if (open) {
      await open.navigate(url);
      return open.focus();
    }
    return self.clients.openWindow(url);
  })());
});
