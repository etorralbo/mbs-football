import { beforeEach, describe, it, expect, vi } from 'vitest'
import {
  request,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ServerError,
} from './httpClient'
import { clearToken, setToken } from '@/app/_shared/auth/tokenStorage'

// ---------------------------------------------------------------------------
// Fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => (key === 'content-type' ? 'application/json' : null) },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

function textResponse(status: number, text: string) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(text),
  })
}

beforeEach(() => {
  mockFetch.mockReset()
  clearToken()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('request', () => {
  it('calls the correct URL using the fallback base', async () => {
    mockFetch.mockReturnValue(jsonResponse(200, {}))
    await request('/v1/sessions')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8000/v1/sessions',
      expect.any(Object),
    )
  })

  it('returns parsed JSON on 200', async () => {
    mockFetch.mockReturnValue(jsonResponse(200, { id: 1 }))
    const data = await request<{ id: number }>('/test')
    expect(data).toEqual({ id: 1 })
  })

  it('attaches Authorization header when a token is stored', async () => {
    setToken('my-token')
    mockFetch.mockReturnValue(jsonResponse(200, {}))
    await request('/test')
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    expect(options.headers['Authorization']).toBe('Bearer my-token')
  })

  it('does not attach Authorization header when no token is stored', async () => {
    mockFetch.mockReturnValue(jsonResponse(200, {}))
    await request('/test')
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    expect(options.headers['Authorization']).toBeUndefined()
  })

  it('throws UnauthorizedError on 401', async () => {
    mockFetch.mockReturnValue(jsonResponse(401, { detail: 'Not authenticated' }))
    await expect(request('/test')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws ForbiddenError on 403', async () => {
    mockFetch.mockReturnValue(jsonResponse(403, { detail: 'Forbidden' }))
    await expect(request('/test')).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('throws NotFoundError on 404', async () => {
    mockFetch.mockReturnValue(jsonResponse(404, { detail: 'Session not found' }))
    await expect(request('/test')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws ValidationError on 422', async () => {
    const detail = [{ loc: ['body', 'email'], msg: 'invalid', type: 'value_error' }]
    mockFetch.mockReturnValue(jsonResponse(422, { detail }))
    await expect(request('/test')).rejects.toBeInstanceOf(ValidationError)
  })

  it('ValidationError preserves the detail payload', async () => {
    const detail = [{ msg: 'required' }]
    mockFetch.mockReturnValue(jsonResponse(422, { detail }))
    const err = await request('/test').catch((e) => e)
    expect(err).toBeInstanceOf(ValidationError)
    expect((err as ValidationError).detail).toEqual(detail)
  })

  it('throws ValidationError on 400', async () => {
    mockFetch.mockReturnValue(jsonResponse(400, { detail: 'bad input' }))
    await expect(request('/test')).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws ServerError on 500', async () => {
    mockFetch.mockReturnValue(jsonResponse(500, { detail: 'internal error' }))
    await expect(request('/test')).rejects.toBeInstanceOf(ServerError)
  })

  it('throws ServerError for non-JSON error responses', async () => {
    mockFetch.mockReturnValue(textResponse(502, 'Bad Gateway'))
    await expect(request('/test')).rejects.toBeInstanceOf(ServerError)
  })
})
