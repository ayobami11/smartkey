/**
 * Typed wrapper around fetch for SmartKey API calls.
 *
 * Handles the boilerplate that appears on every call site:
 *   - Sets Content-Type: application/json for plain-object bodies.
 *   - Passes FormData through as-is (browser sets multipart boundary).
 *   - Parses the response JSON and unwraps the { data, error, status } envelope.
 *   - 204 No Content → { data: null, error: null, status: 204 }.
 *   - Network failure → { data: null, error: 'Unable to reach...', status: 0 }.
 *   - Never throws — callers check result.error.
 *
 * Usage:
 *   const result = await apiFetch<{ users: User[] }>('/api/admin/users');
 *   if (result.error) { toast.error(result.error); return; }
 *   const users = result.data.users;
 */

export type ApiResult<T> = {
  data: T | null;
  error: string | null;
  status: number;
};

type ApiFetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Record<string, unknown> | FormData;
};

export async function apiFetch<T = unknown>(
  url: string,
  options?: ApiFetchOptions
): Promise<ApiResult<T>> {
  const { method = 'GET', body } = options ?? {};

  const isFormData = body instanceof FormData;
  const headers: HeadersInit =
    body && !isFormData ? { 'Content-Type': 'application/json' } : {};

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    return {
      data: null,
      error: 'Unable to reach the server. Check your connection.',
      status: 0,
    };
  }

  if (res.status === 204) {
    return { data: null, error: null, status: 204 };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {
      data: null,
      error: res.ok ? null : 'Unexpected response from server.',
      status: res.status,
    } as ApiResult<T>;
  }

  if (!res.ok) {
    return {
      data: null,
      error:
        (json as { error?: string }).error ??
        'Something went wrong. Please try again.',
      status: res.status,
    };
  }

  return {
    data: (json as { data: T }).data,
    error: null,
    status: res.status,
  };
}
