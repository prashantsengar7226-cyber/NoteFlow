import { env } from './platform';
// Deliberately structured: no request bodies, headers, messages, keys or transcripts.
export async function recordEvent(event: string, options: {actor?:string;code?:string;status?:number;resource?:string} = {}) {
  const safe=(value:string|undefined,max:number)=>value?.replace(/[^a-zA-Z0-9_./:-]/g,'').slice(0,max)||null;
  try {
    await env.DB.prepare('INSERT INTO operational_events(id,actor,event,code,status,resource,created_at) VALUES(?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),safe(options.actor,80),safe(event,60),safe(options.code,60),options.status??null,safe(options.resource,100),Date.now()).run();
  } catch { console.warn('operational_event_unavailable'); }
}
