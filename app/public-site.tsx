'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Check, CircleHelp, CirclePlay, FileText, Home, Layers, LockKeyhole, Menu, Network, Pencil, Presentation, ShieldCheck, Sparkles, X } from 'lucide-react';
import { findStudyTool, SOURCE_HANDOFF, studyTools, type StudyToolId } from '@/lib/study-tools';

const icons = { youtube: CirclePlay, pdf: FileText, text: Pencil, flashcards: Layers, quiz: CircleHelp, mindmap: Network, slides: Presentation };
const questions = [
  ['What can I import?', 'Public, completed YouTube videos, text-based PDFs and supported documents, or pasted text and transcripts. Scanned PDFs need text extraction first. Audio/video file transcription is not currently available.'],
  ['Is NoteFlow free?', 'The regular study tools use free AI providers with no NoteFlow daily AI cap. Provider rate limits and availability still apply. Import and file limits are shown in the workspace. Paid Vertex summaries and insights are currently available only to the administrator.'],
  ['What happens when AI is busy?', 'Completed parts are saved. Eligible jobs enter the recovery queue, and the workspace shows progress or a reason to retry. You can read the original transcript while you wait. Source excerpts are kept separate from AI notes.'],
  ['Can I trust every answer?', 'AI can make mistakes and transcripts can omit or mishear words. Check the source references, especially names, dates and numbers. Notes based on a transcript do not analyse visual information in the video.'],
  ['Can I use my own API key?', 'Yes. In Settings, choose a supported provider, load its available models and test your connection. Your provider’s usage limits and charges apply. Never paste an API key into a note or share it in chat.'],
  ['How do quizzes and flashcards work?', 'Create or open a note, then choose Quiz or Flashcards in its tool tabs. Your saved source provides the material. Mind maps, slides, translation and source chat are available in the same workspace.'],
];

export default function PublicSite({ page = 'home', toolId }: { page?: 'home' | 'tool' | 'access' | 'help'; toolId?: StudyToolId }) {
  const tool = findStudyTool(toolId);
  const [source, setSource] = useState<'youtube' | 'document' | 'text'>(tool?.source || 'youtube');
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState(false);
  const [preview, setPreview] = useState('Notes');
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const rail = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)');
    const update = () => { setNarrow(query.matches); if (!query.matches) setMenu(false); };
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    rail.current?.querySelector<HTMLElement>('a,button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenu(false); menuButton.current?.focus(); }
      if (event.key === 'Tab') {
        const nodes = Array.from(rail.current?.querySelectorAll<HTMLElement>('a,button') || []);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', key); requestAnimationFrame(() => menuButton.current?.focus()); };
  }, [menu]);
  function continueToWorkspace(event: FormEvent) {
    event.preventDefault();
    const id = tool?.id || (source === 'document' ? 'pdf' : source);
    try { sessionStorage.setItem(SOURCE_HANDOFF, JSON.stringify({ source, text: draft.slice(0, 100000), createdAt: Date.now() })); } catch { /* Import remains available when storage is blocked. */ }
    window.location.assign('/login?tool=' + id);
  }
  const currentLabel = page === 'access' ? 'Plans & access' : page === 'help' ? 'Help & FAQ' : tool?.name || 'Your study workspace';
  return <div className="nf-public">
    <a href="#public-main" className="skip-link">Skip to content</a>
    {menu && <button className="nf-backdrop" aria-label="Close navigation" onClick={() => {setMenu(false);menuButton.current?.focus();}}/>}
    <aside ref={rail} id="public-navigation" className={`nf-rail ${menu ? 'is-open' : ''}`} inert={narrow && !menu}>
      <a className="nf-logo" href="/welcome"><img src="/favicon.svg" width="30" height="30" alt=""/>noteflow<span>.</span></a>
      <button className="nf-close" aria-label="Close navigation" onClick={() => {setMenu(false);menuButton.current?.focus();}}><X size={20}/></button>
      <nav aria-label="Study tools">
        <a href="/welcome" aria-current={page === 'home' ? 'page' : undefined}><Home size={18}/>Home</a>
        <span className="nf-nav-label">CREATE & STUDY</span>
        {studyTools.map(item => { const Icon = icons[item.id]; return <a href={'/tools/' + item.id} key={item.id} aria-current={tool?.id === item.id ? 'page' : undefined}><Icon size={18}/>{item.name}</a>; })}
        <div className="nf-nav-divider"/>
        <a href="/login"><BookOpen size={18}/>My workspace<ArrowUpRight size={14}/></a>
      </nav>
      <div className="nf-rail-bottom"><p><ShieldCheck size={16}/>Your sources. Your space.</p><a href="/login" className="nf-dark">Sign in <ArrowRight size={16}/></a><div><a href="/access">Access</a><a href="/help">Help</a></div></div>
    </aside>
    <div className="nf-public-body" inert={narrow && menu}>
      <header className="nf-top"><button ref={menuButton} className="nf-menu" aria-label="Open navigation" aria-expanded={menu} aria-controls="public-navigation" onClick={() => setMenu(true)}><Menu size={22}/></button><span>{currentLabel}</span><nav aria-label="Website"><a href="/access" aria-current={page === 'access' ? 'page' : undefined}>Access</a><a href="/help" aria-current={page === 'help' ? 'page' : undefined}>Help</a><a className="nf-top-login" href="/login">Open workspace <ArrowUpRight size={14}/></a></nav></header>
      <main id="public-main" className="nf-main" tabIndex={-1}>
        {page === 'help' ? <><div className="nf-heading"><h1>Here to help you study.</h1><p>Practical answers before your next session.</p></div><div className="nf-faq">{questions.map(([q,a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div><div className="nf-bottom-cta"><h2>Start with something you want to learn.</h2><a className="nf-button" href="/welcome">Choose a source <ArrowRight size={16}/></a></div></> : page === 'access' ? <><div className="nf-heading"><h1>A place for every study session.</h1><p>Start with free study tools. Choose your own AI connection when you need it.</p></div><div className="nf-access-grid"><section className="nf-access-card"><span className="nf-pill">AVAILABLE NOW</span><h2>Study workspace</h2><strong>Free<span> during launch</span></strong><p>For turning your sources into material you can return to.</p><ul>{['Transcript-based revision guides','Flashcards, quizzes and mind maps','Personal notes, source chat and slides','PDF exports and private collections'].map(x=><li key={x}><Check size={17}/>{x}</li>)}</ul><a className="nf-button" href="/login">Create your workspace <ArrowRight size={16}/></a><small>No daily NoteFlow AI cap. Provider availability and import limits apply.</small></section><section className="nf-access-card nf-access-secondary"><span className="nf-pill">YOUR CHOICE</span><h2>Connect your AI</h2><p>Bring a supported provider key and choose an available model in Settings.</p><ul><li><Check size={17}/>Select the provider and model</li><li><Check size={17}/>Test the connection before using it</li><li><Check size={17}/>Your provider’s limits and billing apply</li></ul><a href="/login" className="nf-secondary">Open settings in your workspace <ArrowRight size={16}/></a><div className="nf-locked"><LockKeyhole size={18}/><p><strong>Vertex AI · admin access</strong>Paid Vertex summaries and insights are currently restricted to the administrator.</p></div></section></div></> : <>
          <div className="nf-heading"><h1>{tool?.title || <>Your next study session, <br/><em>already organized.</em></>}</h1><p>{tool?.description || 'Turn videos, documents and transcripts into notes you can actually revise.'}</p></div>
          <section className="nf-composer" aria-label="Start a study note">
            <div className="nf-source-tabs" role="tablist" aria-label="Choose a source">{[{id:'youtube',label:'YouTube',icon:CirclePlay},{id:'document',label:'PDF & documents',icon:FileText},{id:'text',label:'Paste text',icon:Pencil}].map((item,index) => <button key={item.id} id={'public-source-'+item.id} role="tab" aria-controls="public-source-panel" aria-selected={source === item.id} tabIndex={source === item.id ? 0 : -1} onClick={()=>{setSource(item.id as typeof source);setDraft('');}} onKeyDown={event=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();const ids=['youtube','document','text'] as const;const n=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;setSource(ids[n]);setDraft('');document.getElementById('public-source-'+ids[n])?.focus();}}><item.icon size={18}/>{item.label}</button>)}</div>
            <form onSubmit={continueToWorkspace}>
              <div id="public-source-panel" role="tabpanel" aria-labelledby={'public-source-'+source} className="nf-input-area">
                {source === 'document' ? <div className="nf-document-input"><FileText size={30}/><strong>Your next chapter starts here.</strong><p>Choose a text-based document after signing in.<br/>You can also combine multiple PDFs in your workspace.</p></div> : <><label htmlFor="public-source-input">{source === 'youtube' ? 'YouTube video link' : 'Text or transcript'}</label><textarea id="public-source-input" value={draft} maxLength={100000} onChange={event=>setDraft(event.target.value)} rows={source === 'youtube' ? 2 : 4} placeholder={source === 'youtube' ? 'Paste a YouTube link to get started…' : 'Paste your transcript, lecture notes or article…'}/></>}
                <div className="nf-composer-meta"><span><Sparkles size={14}/>{tool?.output || 'Revision guide'}</span><span><ShieldCheck size={14}/>Source-based study</span></div>
              </div>
              <button className="nf-button nf-generate" type="submit">{tool?.action || (source === 'document' ? 'Choose a document' : 'Create study notes')}<ArrowRight size={18}/></button>
              <p className="nf-composer-note">Continue in your private workspace. Free AI provider limits apply.</p>
            </form>
          </section>
          <div className="nf-tool-links" aria-label="More study tools">{studyTools.filter(item=>['flashcards','quiz','mindmap','slides'].includes(item.id)).map(item=>{const Icon=icons[item.id];return <a href={'/tools/'+item.id} key={item.id}><Icon size={16}/>{item.name}<ArrowUpRight size={13}/></a>;})}</div>
          <section className="nf-preview-section"><div className="nf-section-title"><div><h2>A clearer way to prepare.</h2></div><span className="nf-example-label">Illustrative example · not generated output</span></div><div className="nf-preview"><div className="nf-example-source"><span><FileText size={17}/>EXAMPLE SOURCE</span><h3>How memory works</h3><p>Retrieval practice means recalling information without looking at the answer. Spacing those attempts over time can help long-term retention.</p><div><BookOpen size={15}/>Short study passage</div></div><div className="nf-example-output"><div className="nf-preview-tabs" role="tablist" aria-label="Example study tools">{['Notes','Flashcards','Quiz'].map((name,index)=><button role="tab" key={name} id={'example-'+name} aria-controls="example-panel" aria-selected={preview===name} tabIndex={preview===name?0:-1} onClick={()=>setPreview(name)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const names=['Notes','Flashcards','Quiz'];const n=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;setPreview(names[n]);document.getElementById('example-'+names[n])?.focus();}}>{name}</button>)}</div><div id="example-panel" className="nf-preview-content" role="tabpanel" aria-labelledby={'example-'+preview}>{preview==='Notes'?<><span className="nf-pill">KEY IDEA</span><h3>Practise remembering,<br/>not just rereading.</h3><ul><li>Recall the answer before checking it.</li><li>Return to the material over time.</li></ul><span className="nf-example-citation">Source: example passage</span></>:preview==='Flashcards'?<button className="nf-flashcard" aria-label={flipped?'Show flashcard question':'Reveal flashcard answer'} onClick={()=>setFlipped(!flipped)}><small>{flipped?'ANSWER':'QUESTION · 1 OF 1'}</small><strong>{flipped?'Recalling information without looking at the answer.':'What is retrieval practice?'}</strong><span>{flipped?'Click to see question':'Click to reveal answer'} ↻</span></button>:<div className="nf-demo-quiz"><h3>Which action uses retrieval practice?</h3>{['Rereading a paragraph','Answering before checking your notes'].map((text,index)=><button className={answer===index?'chosen':''} key={text} onClick={()=>setAnswer(index)}>{String.fromCharCode(65+index)}<span>{text}</span>{answer===index&&<Check size={16}/>}</button>)}<p role="status">{answer===null?'Choose an answer.':answer===1?'Correct. You retrieve the information before checking.':'Try again. Retrieval means recalling before checking.'}</p></div>}</div></div></div></section>
          <section className="nf-workflow"><div><span>01</span><h3>Bring your source</h3><p>A video link, document or transcript. Keep your original material close.</p></div><div><span>02</span><h3>Read with context</h3><p>Review the guide, follow references and add notes in your own words.</p></div><div><span>03</span><h3>Make it stick</h3><p>Use flashcards, quizzes and mind maps to prepare for what comes next.</p></div></section>
        </>}
      </main>
      <footer className="nf-footer"><a className="nf-logo" href="/welcome"><img src="/favicon.svg" width="24" height="24" alt=""/>noteflow.</a><span>From source to understanding.</span><nav aria-label="Footer"><a href="/access">Access</a><a href="/help">Help & FAQ</a><a href="/login">Sign in</a></nav></footer>
    </div>
  </div>;
}
