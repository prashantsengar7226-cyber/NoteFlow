export class APIError extends Error {
  constructor(message: string, public recoverable = false, public status = 0) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', payload?: unknown, timeoutMs = 180000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let r: Response;
    try {
      r = await fetch(path, {
        method,
        signal: controller.signal,
        headers: payload ? { 'Content-Type': 'application/json' } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
    } catch {
      throw new APIError(
        controller.signal.aborted
          ? 'The request took too long. Check your library before retrying; your source may already be saved.'
          : 'Connection lost. Check your internet connection and retry. Your input is still here.',
        true,
      );
    }
    if (r.status === 401)
      throw new APIError('Your session expired. Sign in with your account again to continue.', false, 401);
    let data: T & { error?: string; code?: string; resetAt?: number; retryAt?: number };
    try {
      data = await r.json();
    } catch {
      throw new APIError(
        'The server could not finish the request. Please retry shortly; your input is still here.',
        true, r.status,
      );
    }
    if (!r.ok)
      throw new APIError(
        (data.error || 'Request failed. Please try again.') +
          (data.resetAt ? ` Next reset: ${new Date(data.resetAt).toLocaleString()}.` : '') +
          (data.retryAt ? ` Retry after ${new Date(data.retryAt).toLocaleTimeString()}.` : ''),
        r.status >= 500 || data.code === 'IMPORT_IN_PROGRESS', r.status,
      );
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Read the owner-scoped receipt after an interrupted response. Never repeat a paid
// provider request merely because its HTTP confirmation was lost.
export async function recoverableImport<T>(payload: Record<string, unknown> & { requestId: string }): Promise<{ note: T }> {
  try {
    return await api<{ note: T }>('/api/notes', 'POST', payload);
  } catch (error) {
    if (!(error instanceof APIError) || !error.recoverable) throw error;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        const receipt = await api<{ note: T | null }>(`/api/notes?requestId=${encodeURIComponent(payload.requestId)}`, 'GET', undefined, 10000);
        if (receipt.note) return { note: receipt.note };
      } catch (lookupError) {
        if (!(lookupError instanceof APIError) || !lookupError.recoverable) throw lookupError;
      }
    }
    throw new APIError('We could not confirm the import yet. Check your library or retry this same import; a saved source will not be duplicated.', true);
  }
}
