export class ApiRequestError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function readApiJson(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { return null; }
}

export function apiFailure(value: unknown, fallback: string): ApiRequestError {
  if (!value || typeof value !== 'object') return new ApiRequestError(fallback);
  const body = value as { error?: unknown; message?: unknown };
  return new ApiRequestError(
    typeof body.message === 'string' ? body.message : fallback,
    typeof body.error === 'string' ? body.error : undefined,
  );
}
