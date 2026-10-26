import type { Summary } from './core';
export type PublicJob = { id:string; title?:string; noteId:string; state:string; nextAt:number; completedParts:number; totalParts:number; errorCode:string|null; background:boolean };
export async function queueRequest<T>(path:string, method='GET', value?:unknown):Promise<T> {
  const response = await fetch(path,{method,headers: value ? {'Content-Type':'application/json'} : undefined,body:value ? JSON.stringify(value):undefined,cache:'no-store'});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The task could not be updated. Please try again.');
  return data;
}
export function jobMessage(job:PublicJob) {
  if (job.state === 'failed') {
    if (job.errorCode === 'QUALITY_REVIEW' || job.errorCode === 'QUALITY_EVIDENCE') return 'Source checks could not confirm this part. Your transcript and checked parts are saved. Review the transcript or select another model in AI settings, then resume.';
    if (job.errorCode === 'INVALID_AI_OUTPUT' || job.errorCode === 'INVALID_CITATION') return 'The model repeatedly returned an unusable response. Your saved work is safe. Select another available model in AI settings, then resume.';
    if (job.errorCode === 'TIMEOUT') return 'The AI provider repeatedly timed out. Your saved work is safe. Resume later or select another model in AI settings.';
    if (job.errorCode === 'AI_CONNECTION_CHANGED') return 'Your AI connection changed. Resume to use the current connection.';
    return 'Automatic retries stopped. Check your AI connection and resume. Saved parts are safe.';
  }
  if (job.state === 'retry') {
    const time = new Date(job.nextAt).toLocaleTimeString();
    if (job.errorCode === 'PROVIDER_LIMIT' || job.errorCode === 'PROVIDER_COOLDOWN') return `Your AI provider's quota or rate limit was reached. Automatic retry at ${time}. Saved parts are safe.`;
    if (job.errorCode === 'QUALITY_REVIEW') return `A draft needs corrections after source checking. Automatic repair at ${time}. Checked parts are safe.`;
    return `Waiting to retry at ${time}. Saved parts are safe.`;
  }
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
    if (job.state!=='cancelled') {
      const data=await queueRequest<{note:{summary:Summary|null}}>(`/api/notes?id=${encodeURIComponent(id)}`);
      // Return a usable, explicitly labelled result while background AI recovery
      // retains its own state and cooldown. Never present an unchecked draft.
      if (data.note.summary?.fallback) return data.note.summary;
      if (job.state==='failed') throw new Error(jobMessage(job));
    }
    if (job.state==='cancelled') throw new Error('Task cancelled. Saved summary parts remain available.');
    if (job.state!=='running' && job.nextAt<=Date.now()) await queueRequest('/api/ai-jobs','POST',{jobId:job.id});
    await new Promise(resolve=>setTimeout(resolve,10000));
    ({job}=await queueRequest<{job:PublicJob}>(`/api/ai-jobs?id=${job.id}`));
  }
  throw new Error('Your summary is still queued. Follow its progress in Summary tasks; completed parts are saved.');
}
