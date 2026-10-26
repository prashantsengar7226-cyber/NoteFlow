'use client';
import {useEffect,useRef,useState} from 'react';
import {queueRequest,jobMessage,type PublicJob} from '@/lib/queue-client';
export function SummaryQueue({onUpdated}:{onUpdated:(jobs:PublicJob[])=>void}) {
  const [jobs,setJobs]=useState<PublicJob[]>([]);
  const [error,setError]=useState('');
  const callback=useRef(onUpdated);callback.current=onUpdated;
  useEffect(()=>{
    let stopped=false;let timer:ReturnType<typeof setTimeout>;
    async function refresh(){
      try {
        const data=await queueRequest<{jobs:PublicJob[]}>('/api/ai-jobs');
        if(stopped)return;
        setJobs(data.jobs);setError('');callback.current(data.jobs);
        const due=data.jobs.find(j=>j.state!=='running'&&j.nextAt<=Date.now());
        if(due)await queueRequest('/api/ai-jobs','POST',{jobId:due.id});
      }catch{if(!stopped)setError('Task updates are temporarily unavailable. Saved work is safe.');}
      if(!stopped)timer=setTimeout(refresh,15000);
    }
    void refresh();return()=>{stopped=true;clearTimeout(timer);};
  },[]);
  if(!jobs.length&&!error)return null;
  return <aside className="summary-queue" aria-label="Summary tasks">
    <h2>Summary tasks</h2>
    {error&&<p role="status">{error}</p>}
    {jobs.map(job=><div className="queue-task" key={job.id}><div><strong>{job.title||'Summary task'}</strong><p>{job.completedParts} of {job.totalParts||'…'} parts saved. {jobMessage(job)}</p><small>{job.background?'Background recovery enabled.':'Keep NoteFlow open until the site owner connects the background scheduler.'}</small></div><button type="button" onClick={async()=>{try{await queueRequest('/api/ai-jobs','DELETE',{jobId:job.id});const remaining=jobs.filter(j=>j.id!==job.id);setJobs(remaining);callback.current(remaining);}catch{setError('Could not cancel the task. Try again.');}}}>Cancel task</button></div>)}
  </aside>;
}
