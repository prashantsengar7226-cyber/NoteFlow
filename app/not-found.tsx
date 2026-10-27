import { ArrowLeft, BookOpen } from 'lucide-react';
export default function NotFound() {
  return <main className="nf-not-found"><a className="nf-logo" href="/welcome"><img src="/favicon.svg" width="30" height="30" alt=""/>noteflow.</a><BookOpen size={40} aria-hidden="true"/><h1>This page isn’t in the library.</h1><p>The link may have changed. Your workspace and study tools are still here.</p><a className="nf-button" href="/welcome"><ArrowLeft size={17}/>Back to NoteFlow</a></main>;
}
