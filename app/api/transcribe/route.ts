export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
﻿import { guard, handleError } from '@/lib/server';
import { AppError } from '@/lib/core';
export async function POST(request: Request) {
  try {
    await guard(request, true);
    throw new AppError(
      503,
      'AUDIO_UNAVAILABLE',
      'Audio/video uploads are not enabled on this site. Paste a transcript or import subtitles instead.',
    );
  } catch (error) {
    return handleError(error);
  }
}
