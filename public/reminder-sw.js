self.addEventListener('push',event=>{
  let data;try{data=event.data?.json();}catch{return;}
  if(!data||typeof data.title!=='string')return;
  const path=typeof data.url==='string'&&/^\/dashboard\/tasks\/[0-9a-f-]{36}$/.test(data.url)?data.url:'/dashboard/notifications';
  event.waitUntil(self.registration.showNotification(data.title.slice(0,160),{body:String(data.body||'').slice(0,200),tag:String(data.tag||'actionflow').slice(0,180),data:{url:path},icon:'/reminder-icon.png'}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();const path=event.notification.data?.url||'/dashboard/notifications';const url=new URL(path,self.location.origin);if(url.origin!==self.location.origin)return;event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{for(const client of windows)if(new URL(client.url).origin===url.origin){await client.navigate(url.href);return client.focus();}return clients.openWindow(url.href);}));});
