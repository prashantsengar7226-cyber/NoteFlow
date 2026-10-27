import { notFound } from 'next/navigation';
import { findStudyTool, studyTools } from '@/lib/study-tools';
import PublicSite from '../../public-site';
export const dynamicParams = false;
export function generateStaticParams() { return studyTools.map(tool => ({ tool: tool.id })); }
export async function generateMetadata({ params }: { params: Promise<{tool:string}> }) { const tool = findStudyTool((await params).tool); return {title: tool ? tool.name + ' — NoteFlow' : 'Tool not found — NoteFlow'}; }
export default async function ToolPage({ params }: { params: Promise<{tool:string}> }) { const tool = findStudyTool((await params).tool); if (!tool) notFound(); return <PublicSite page="tool" toolId={tool.id}/>; }
