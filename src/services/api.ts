const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    throw new Error('Cannot reach the Dimag backend. Check that the server is running and try again.', {
      cause: error,
    });
  }

  const result = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(result.error || `Backend request failed (${response.status}).`);
  }
  return result;
}
