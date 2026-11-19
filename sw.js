const CACHE = 'smart-salary-v9-16-playfirst-ember-20261118-r20';
const ASSETS = ['./','./index.html','./manifest.webmanifest','./api-config.js','./Ronykhan_Salaryapp_launcher_2.png','./Ronykhan_Salaryapp_launcher_1.png?v=9.14','./allahu-akbar.mp3','./daily.html'];
self.addEventListener('message',e=>{if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==self.location.origin)return;const path=url.pathname;if(req.headers.has('range')||/\.(mp3|wav|ogg|m4a|mp4)$/i.test(path))return;const isShell=path==='/'||path.endsWith('/index.html')||path.endsWith('/sw.js')||path.endsWith('/api-config.js');if(isShell){e.respondWith(fetch(req,{cache:'no-store'}).then(res=>{if(res.ok&&res.status===200){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return res}).catch(()=>caches.match(req).then(hit=>hit||caches.match('./index.html'))));return;}e.respondWith(fetch(req).then(res=>{if(res.ok&&res.status===200){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return res}).catch(()=>caches.match(req)))});

self.addEventListener('push',event=>{
 let data={};try{data=event.data?event.data.json():{}}catch(_){}
 const title=data.title||'Smart Salary App';
 const options={body:data.body||'আজকের ইসলামিক বার্তা',icon:'./Ronykhan_Salaryapp_launcher_2.png',badge:'./Ronykhan_Salaryapp_launcher_2.png',tag:data.tag||'smart-salary-daily',renotify:false,data:{url:data.url||'./'}};
 event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=new URL(event.notification.data?.url||'./',self.location.origin).href;
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
  for(const client of list){if(new URL(client.url).origin===self.location.origin){client.navigate(target);return client.focus();}}
  return clients.openWindow(target);
 }));
});
