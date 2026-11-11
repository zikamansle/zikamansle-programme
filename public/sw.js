const CACHE='zika-mobile-v16-team-unified-notifications',FILES=["assets/push-badge-z.png","notifications.js","plan.html", "config.js", "model.js", "mobile.js", "index.html", "manifest.webmanifest", "mobile.css", "assets/partner-19.webp", "assets/partner-8.webp", "assets/partner-7.webp", "assets/partner-23.webp", "assets/festival-scene.svg", "assets/partner-5.webp", "assets/partner-6.webp", "assets/partner-11.webp", "assets/partner-17.webp", "assets/logo.png", "assets/partner-25.webp", "assets/partner-14.webp", "assets/partner-3.webp", "assets/icon-192.png", "assets/partner-15.webp", "assets/partner-16.webp", "assets/partner-2.webp", "assets/partner-13.webp", "assets/partner-1.webp", "assets/partner-21.webp", "assets/partner-18.webp", "assets/partner-20.webp", "assets/partner-22.webp", "assets/partner-4.webp", "assets/partner-12.webp", "assets/icon-512.png", "assets/partner-24.webp", "assets/partner-10.webp", "assets/partner-9.webp", "data/partners.json", "data/programme.json", "data/site.json"];
const base=new URL('./',self.location.href);
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new URL(f,base).href)))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('zika-mobile-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data==='ACTIVATE_UPDATE')self.skipWaiting()});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(base.pathname))return;const name=u.pathname.slice(base.pathname.length)||'index.html';if(!FILES.includes(name))return;const key=new URL(name,base).href;e.respondWith((async()=>{const c=await caches.open(CACHE);try{const r=await fetch(e.request);if(r.ok)await c.put(key,r.clone());return r}catch{return await c.match(key)||Response.error()}})())});
self.addEventListener('push',event=>{event.waitUntil((async()=>{
 let data={title:'Festival ZikaMansle',body:'Une nouvelle information vous attend dans l’application.',url:'/index.html#actualites'};
 try{if(event.data)data={...data,...event.data.json()}}catch{}
 let url=self.location.origin+'/index.html#actualites';try{const u=new URL(data.url,self.location.origin);if(u.origin===self.location.origin)url=u.href}catch{}
 let image;try{const u=new URL(data.image,self.location.origin);if(u.origin===self.location.origin&&u.pathname==='/api/push/media')image=u.href}catch{}
 let displayed=false;
 try{
  // Les options Web Push sont une préférence ; Android peut appliquer son canal
  // système et ses réglages de son/vibration à la place.
  const silent=data.silent===true;
  const vibrate=!silent&&Array.isArray(data.vibrate)?data.vibrate.filter(v=>Number.isInteger(v)&&v>=0&&v<=1000).slice(0,6):[];
  const teamTag=typeof data.groupId==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(data.groupId)?'zikateam-'+data.groupId:null;
  await self.registration.showNotification(data.title,{body:data.body,...(image?{image}:{}),icon:'/assets/icon-192.png',badge:'/assets/push-badge-z.png',tag:teamTag||data.id||'zika-info',...(teamTag?{renotify:true}:{}),silent,...(!silent&&vibrate.length?{vibrate}:{}),data:{url}});
  displayed=true
 }finally{
  if(data.id)try{const sub=await self.registration.pushManager.getSubscription();if(sub)await fetch('/api/push/receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:data.id,subscription:sub.toJSON(),displayed}),signal:AbortSignal.timeout(5000)})}catch{}
 }
})())});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 const url=event.notification.data?.url||self.location.origin+'/index.html#actualites';
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.navigate(url);return client.focus()}}
 return self.clients.openWindow(url);
})())});
