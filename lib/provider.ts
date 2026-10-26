import { AppError } from './core';

export class TransientProviderError extends AppError {
  constructor(
    readonly providerStatus: number,
    readonly retryAfterMs: number,
    provider: string,
  ) {
    super(
      503,
      'PROVIDER_BUSY',
      `${provider} is temporarily unavailable. Saved summary parts are safe; resume to continue when the service recovers.`,
    );
  }
}
function retryAfter(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

// Do not follow redirects with API credentials. workerd rejects redirect:"error".
export async function providerFetch(url: string, init: RequestInit, name: string, timeout = 60000) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
      throw new AppError(
        504,
        'TIMEOUT',
        `${name} took too long. Please try again; your saved work is safe.`,
      );
    throw new AppError(
      502,
      'PROVIDER_NETWORK',
      name === 'Transcription'
        ? 'The transcription service could not be reached. Try again shortly or import a transcript manually.'
        : `${name} could not be reached. Your saved work is safe. Please try again.`,
    );
  }
  if (response.ok) return response;
  // Never log response bodies, URLs, source text or headers containing credentials.
  console.warn(
    JSON.stringify({ event: 'provider_failed', provider: name, status: response.status }),
  );
  const retryDelay = retryAfter(response.headers.get('retry-after'));
  // Groq returns a generation/schema failure as HTTP 400. This is different
  // from an invalid request setting: permit fallback only for its exact code.
  if (name === 'Groq' && response.status === 400) {
    const data = await providerJson(response, 100000).catch(() => null);
    const error = data?.error as { code?: unknown } | undefined;
    if (error?.code === 'json_validate_failed')
      throw new AppError(502, 'INVALID_AI_OUTPUT', 'The AI response did not match the required format. Your saved work is safe.');
  }
  await response.body?.cancel();
  if (name !== 'Transcription' && [500, 502, 503, 504].includes(response.status))
    throw new TransientProviderError(response.status, retryDelay, name);
  if (response.status >= 300 && response.status < 400)
    throw new AppError(
      502,
      'PROVIDER_REDIRECT',
      'The service returned an unexpected redirect. Please try again later.',
    );
  if (response.status === 429 || response.status === 402)
    throw new AppError(
      429,
      'PROVIDER_LIMIT',
      `${name} is at its shared service limit. Try later. Basic summary works with pasted text, PDFs and subtitles.`,
      response.status === 402 ? 3600 : Math.max(60, Math.min(3600, Math.ceil(retryDelay / 1000))),
    );
  if (name !== 'Transcription' && response.status === 413)
    throw new AppError(413, 'PROVIDER_INPUT_LIMIT', 'This AI request exceeds the provider\'s input limit. For an older paused run, choose Basic summary to clear its progress, then generate a new Detailed summary with smaller sections. Your source remains saved.');
  if (response.status === 401 || response.status === 403)
    throw new AppError(
      503,
      'PROVIDER_AUTH',
      `${name} is temporarily unavailable. The site owner needs to check the service configuration.`,
    );
  if (name !== 'Transcription' && response.status === 404)
    throw new AppError(
      503,
      'MODEL_UNAVAILABLE',
      'The AI model is unavailable. Use Basic summary while the site owner restores the service.',
    );
  if (name !== 'Transcription' && [400, 422].includes(response.status))
    throw new AppError(
      502,
      'PROVIDER_REQUEST',
      `${name} rejected the AI request. Check the configured model and supported generation settings. Your saved work is safe.`,
    );
  if (name === 'Transcription' && [400, 404, 422].includes(response.status))
    throw new AppError(
      422,
      'SOURCE_UNAVAILABLE',
      'This video could not be transcribed. Use a public, completed video, or paste its transcript. Live, private or restricted videos may be unavailable.',
    );
  throw new AppError(
    502,
    'PROVIDER_ERROR',
    `${name} is temporarily unavailable. Please try again shortly.`,
  );
}

export async function providerJson(
  response: Response,
  maxBytes = 2_000_000,
): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (!reader) throw new Error('empty');
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError(
          502,
          'PROVIDER_RESPONSE_LIMIT',
          'The service response was too large. Try a shorter source.',
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
      throw new AppError(504, 'TIMEOUT', 'The service response timed out. Please try again.');
    throw new AppError(
      502,
      'PROVIDER_RESPONSE',
      'The service returned an unreadable response. Please try again shortly.',
    );
  } finally {
    reader?.releaseLock();
  }
}

/** At most three attempts within ONE deadline. Never retry unknown outcomes, auth or quota. */
export async function geminiGenerate(
  key: string,
  model: string,
  fallback: string,
  payload: Record<string, unknown>,
  timeout: number,
  clock = {
    now: () => Date.now(),
    wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    random: () => Math.random(),
  },
) {
  const started = clock.now();
  let selected = model;
  let usedFallback = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = timeout - (clock.now() - started);
    if (remaining < 1000)
      throw new AppError(
        504,
        'TIMEOUT',
        'AI took too long. Saved parts are safe; resume to continue.',
      );
    const generationConfig = {
      ...(payload.generationConfig as Record<string, unknown>),
      ...(/^gemini-3\.(6|8)-flash$/.test(selected)
        ? { thinkingConfig: { thinkingLevel: 'low' } }
        : {}),
    };
    try {
      const response = await providerFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selected)}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, generationConfig }),
        },
        'Gemini',
        remaining,
      );
      return { response, model: selected };
    } catch (error) {
      if (attempt === 2) throw error;
      const canFallback = fallback && fallback !== selected && !usedFallback;
      if (error instanceof AppError && error.code === 'MODEL_UNAVAILABLE' && canFallback) {
        selected = fallback;
        usedFallback = true;
        continue;
      }
      if (!(error instanceof TransientProviderError)) throw error;
      const delay = Math.max(
        error.retryAfterMs,
        1000 * 2 ** attempt + Math.floor(clock.random() * 250),
      );
      // Honor long Retry-After values by pausing, rather than retrying too soon or exceeding the lease.
      if (delay + 1000 >= timeout - (clock.now() - started)) throw error;
      if (error.providerStatus === 503 && attempt >= 1 && canFallback) {
        selected = fallback;
        usedFallback = true;
      }
      await clock.wait(delay);
    }
  }
  throw new AppError(503, 'MODEL_UNAVAILABLE', 'No AI model is configured.');
}


export type RouterProvider = 'gemini' | 'groq' | 'openrouter';
export type RouterCandidate = {
  provider: RouterProvider;
  key: string;
  model: string;
  fallbackModel?: string;
  freeOnly?: boolean;
};
export type RouterResult = { response: Response; provider: RouterProvider; model: string; elapsedMs: number };
export type RouterOptions = {
  responseSchema?: Record<string, unknown>;
  validate?: (result: RouterResult) => Promise<void>;
  onFailure?: (candidate: RouterCandidate, error: unknown) => Promise<void>;
  wait?: (ms: number) => Promise<void>;
};

function isFallbackError(error: unknown) {
  return error instanceof AppError && [
    'PROVIDER_BUSY', 'PROVIDER_LIMIT', 'PROVIDER_NETWORK', 'TIMEOUT',
    'MODEL_UNAVAILABLE', 'PROVIDER_ERROR', 'PROVIDER_RESPONSE',
    'INVALID_AI_OUTPUT', 'INVALID_CITATION', 'OUTPUT_LIMIT',
    'PROVIDER_INPUT_LIMIT',
  ].includes(error.code);
}

async function compatibleGenerate(
  candidate: RouterCandidate,
  systemInstruction: string,
  content: string,
  timeout: number,
  schema?: Record<string, unknown>,
) {
  const isGroq = candidate.provider === 'groq';
  const url = isGroq
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${candidate.key}`,
    'Content-Type': 'application/json',
  };
  if (!isGroq) headers['X-Title'] = 'NoteFlow';
  const response = await providerFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: candidate.model,
      messages: [
        { role: 'system', content: systemInstruction + (schema ? '\nRequired JSON Schema (all fields and limits are mandatory):\n' + JSON.stringify(schema) : '') },
        { role: 'user', content },
      ],
      // JSON-object mode guarantees syntax only. Use constrained schema output
      // on supported Groq models and require compatible OpenRouter endpoints.
      response_format: schema && (!isGroq || ['openai/gpt-oss-120b','openai/gpt-oss-20b','qwen/qwen3.8-27b','meta-models/muse-spark-open'].includes(candidate.model))
        ? { type: 'json_schema', json_schema: { name: 'noteflow_output', strict: true, schema } }
        : { type: 'json_object' },
      ...(!isGroq && (schema || candidate.freeOnly) ? { provider: { require_parameters: !!schema, ...(candidate.freeOnly ? { sort: 'throughput', max_price: { prompt: 0, completion: 0, request: 0 } } : {}) } } : {}),
      // Leave output capacity for the notes. The separate source review remains
      // mandatory; do not consume the whole deadline on default deep reasoning.
      ...(!isGroq && candidate.freeOnly ? { reasoning: { effort: 'low' } } : {}),
      max_tokens: 8192,
      temperature: 0.2,
    }),
  }, isGroq ? 'Groq' : 'OpenRouter', timeout);
  return { response, model: candidate.model };
}

/**
 * Bounded multi-provider router. Prefer the next provider after a failure.
 * The last compatible provider may retry one explicit transient HTTP failure.
 * Validate the complete response before accepting it. Invalid output can fall
 * through within the same deadline; auth, refusal and bad requests cannot.
 * Provider keys remain server-only and are never returned to the client or logs.
 */
export async function routedGenerate(
  candidates: RouterCandidate[],
  systemInstruction: string,
  content: string,
  geminiPayload: Record<string, unknown>,
  timeout: number,
  options: RouterOptions = {},
): Promise<RouterResult> {
  if (!candidates.length)
    throw new AppError(503, 'AI_NOT_CONFIGURED', 'No AI provider is configured.');
  const started = Date.now();
  let lastError: unknown;
  for (const [index, candidate] of candidates.entries()) {
    const elapsed = Date.now() - started;
    const remaining = timeout - elapsed;
    if (remaining < 1000) break;
    // Reserve a useful share of the same deadline for each remaining provider.
    // Otherwise one hung provider consumes the entire request and no fallback runs.
    const attemptBudget = Math.min(60000, Math.max(1000, Math.floor(remaining / (candidates.length - index))));
    const attemptStarted = Date.now();
    try {
      let generated;
      try {
        generated = candidate.provider === 'gemini'
          ? await geminiGenerate(candidate.key, candidate.model, candidate.fallbackModel || '', geminiPayload, attemptBudget)
          : await compatibleGenerate(candidate, systemInstruction, content, attemptBudget, options.responseSchema);
      } catch (error) {
        // Only retry a confirmed transient HTTP error when no later provider is
        // available. Never retry quota/auth errors or ambiguous network outcomes.
        const delay = error instanceof TransientProviderError ? Math.max(2000, error.retryAfterMs) : Infinity;
        const retryBudget = attemptBudget - (Date.now() - attemptStarted) - delay;
        if (candidate.provider === 'gemini' || index !== candidates.length - 1 || delay > 10000 || retryBudget < 1000) throw error;
        console.info(JSON.stringify({ event: 'ai_router_transient_retry', provider: candidate.provider, delayMs: delay }));
        await (options.wait ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms))))(delay);
        const remainingBudget = Math.min(retryBudget, attemptBudget - (Date.now() - attemptStarted), timeout - (Date.now() - started));
        if (remainingBudget < 1000) throw error;
        generated = await compatibleGenerate(candidate, systemInstruction, content, remainingBudget, options.responseSchema);
      }
      const result = { ...generated, provider: candidate.provider, elapsedMs: Date.now() - attemptStarted };
      // Body decoding, schema and citation failures must remain inside this try.
      // Otherwise an HTTP 200 is incorrectly recorded as a successful generation.
      await options.validate?.(result);
      const elapsedMs = Date.now() - attemptStarted;
      console.info(JSON.stringify({
        event: 'ai_router_success', provider: candidate.provider,
        model: generated.model, elapsedMs,
      }));
      return { ...generated, provider: candidate.provider, elapsedMs };
    } catch (error) {
      lastError = error;
      await options.onFailure?.(candidate, error);
      console.warn(JSON.stringify({
        event: isFallbackError(error) && index < candidates.length - 1 ? 'ai_router_fallback' : 'ai_router_failed', provider: candidate.provider,
        code: error instanceof AppError ? error.code : 'UNKNOWN',
        elapsedMs: Date.now() - attemptStarted,
      }));
      if (!isFallbackError(error)) throw error;
    }
  }
  if (lastError) throw lastError;
  throw new AppError(504, 'TIMEOUT', 'AI took too long. Saved work is safe; resume to continue.');
}
