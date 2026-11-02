const CACHE='zikamansle-app-v1';
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
