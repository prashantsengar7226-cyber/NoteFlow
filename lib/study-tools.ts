export const studyTools = [
  { id: 'youtube', name: 'YouTube notes', title: 'Turn a video into study notes.', description: 'Start with a public, completed YouTube video. Read a transcript-based revision guide with the source close at hand.', source: 'youtube', output: 'Revision guide', action: 'Create video notes' },
  { id: 'pdf', name: 'PDF notes', title: 'Find the essentials in your PDFs.', description: 'Bring text-based PDFs and documents into one study workspace. Read, revise and export your notes.', source: 'document', output: 'Document notes', action: 'Choose a document' },
  { id: 'text', name: 'Text & transcripts', title: 'Make your transcript study-ready.', description: 'Turn a transcript, article or your own notes into organized revision material.', source: 'text', output: 'Revision guide', action: 'Create text notes' },
  { id: 'flashcards', name: 'Flashcards', title: 'Remember more with active recall.', description: 'Create a note from your source, then open Flashcards to generate a deck and test what you remember.', source: 'text', output: 'Flashcards', action: 'Start with a source' },
  { id: 'quiz', name: 'Quiz generator', title: 'Put your understanding to the test.', description: 'Save your source, open Quiz in your note and practise with questions based on that material.', source: 'text', output: 'Practice questions', action: 'Start with a source' },
  { id: 'mindmap', name: 'Mind maps', title: 'See how the ideas connect.', description: 'Create a note and open Mind map to explore the relationships between its key ideas.', source: 'text', output: 'Mind map', action: 'Start with a source' },
  { id: 'slides', name: 'Study slides', title: 'Give your ideas a clear sequence.', description: 'Save your material, then open Slides to turn the source into a presentation outline.', source: 'text', output: 'Slide outline', action: 'Start with a source' },
] as const;
export type StudyToolId = typeof studyTools[number]['id'];
export function findStudyTool(id: string | null | undefined) { return studyTools.find(tool => tool.id === id); }
export const SOURCE_HANDOFF = 'noteflow.source-handoff.v1';
