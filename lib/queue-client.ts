import type { Summary } from './core';
export type PublicJob = { id:string; title?:string; noteId:string; state:string; nextAt:number; completedParts:number; totalParts:number; errorCode:string|null; background:boolean };
export async function queueRequest<T>(path:string, method='GET', value?:unknown):Promise<T> {
  const response = await fetch(path,{method,headers: value ? {'Content-Type':'application/json'} : undefined,body:value ? JSON.stringify(value):undefined,cache:'no-store'});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The task could not be updated. Please try again.');
  return data;
}
export function jobMessage(job:PublicJob) {
  if (job.state === 'failed') return job.errorCode === 'QUALITY_REVIEW' ? 'Source checks could not confirm this part. Review the transcript or try a different model, then resume.' : job.errorCode === 'AI_CONNECTION_CHANGED' ? 'Your AI connection changed. Resume to use the current connection.' : 'Automatic retries stopped. Check your AI connection and resume. Saved parts are safe.';
  if (job.state === 'retry') return `Waiting to retry at ${new Date(job.nextAt).toLocaleTimeString()}. Saved parts are safe.`;
  return 'Generating and checking against your source. Each finished part is saved.';
}
export async function queuedSummary(id:string, preferences:{language:string;detail:string}, progress:(job:PublicJob)=>void, paused?:()=>boolean):Promise<Summary|null> {
  let {job} = await queueRequest<{job:PublicJob}>('/api/ai-jobs','POST',{id,...preferences});
  const deadline=Date.now()+30*60000;
  while (Date.now()<deadline) {
    progress(job);
    if (paused?.()) { await queueRequest('/api/ai-jobs','DELETE',{jobId:job.id}); return null; }
    if (job.state==='completed') {
      const data=await queueRequest<{note:{summary:Summary}}>(`/api/notes?id=${encodeURIComponent(id)}`);
      return data.note.summary;
    }
    if (job.state==='failed') throw new Error(jobMessage(job));
    if (job.state==='cancelled') throw new Error('Task cancelled. Saved summary parts remain available.');
    if (job.state!=='running' && job.nextAt<=Date.now()) await queueRequest('/api/ai-jobs','POST',{jobId:job.id});
    await new Promise(resolve=>setTimeout(resolve,10000));
    ({job}=await queueRequest<{job:PublicJob}>(`/api/ai-jobs?id=${job.id}`));
  }
  throw new Error('Your summary is still queued. Follow its progress in Summary tasks; completed parts are saved.');
}
