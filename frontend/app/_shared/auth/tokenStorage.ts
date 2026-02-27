/**
 * Thin localStorage wrapper for persisting the Supabase access token.
 *
 * Used by httpClient.test.ts to control Authorization header behaviour
 * in unit tests without involving the real Supabase SDK.
 */
const TOKEN_KEY = 'auth_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}
