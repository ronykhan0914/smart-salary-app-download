const base=String(process.env.API_BASE_URL||'').replace(/\/$/,'');
const secret=process.env.PUSH_CRON_SECRET||'';
if(!base||!secret){console.error('API_BASE_URL and PUSH_CRON_SECRET are required');process.exit(1)}
const hour=new Date().getUTCHours();
const kind=hour===3?'quran':hour===15?'hadith':null;
if(!kind){console.error('Expected UTC 03:00 or 15:00 schedule');process.exit(1)}
const response=await fetch(base+'/api/push/dispatch/'+kind,{method:'POST',headers:{'x-push-secret':secret}});
const body=await response.text();
console.log('dispatch',kind,response.status,body);
if(!response.ok)process.exit(1);
