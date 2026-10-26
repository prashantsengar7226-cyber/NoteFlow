import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const url=new URL(process.argv[2]||'http://127.0.0.1:3000');
if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Use HTTPS except for local testing.');
const key=process.env.QUEUE_WORKER_SECRET;
if(!key||key.length<32)throw new Error('Configure QUEUE_WORKER_SECRET.');
const response=await fetch(new URL('/api/queue-worker',url),{method:'POST',headers:{authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(15000)});
console.log('Queue trigger HTTP '+response.status+'. A 202 means accepted, not that generation finished.');
if(response.status!==202)process.exitCode=1;
