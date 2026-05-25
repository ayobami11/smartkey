export type ApiResponse<T> =
  | { data: T; error: null; status: number }
  | { data: null; error: string; status: number };

/**
 * Construct a successful API response.
 */
export const ok = <T>(data: T, status = 200): ApiResponse<T> => ({
  data,
  error: null,
  status,
});

/**
 * Construct an error API response.
 */
export const err = (message: string, status: number): ApiResponse<never> => ({
  data: null,
  error: message,
  status,
});
