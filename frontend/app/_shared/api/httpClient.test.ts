import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import {
  request,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ServerError,
  TeamNotSelectedError,
  StaleTeamRequestError,
} from './httpClient'
import { clearToken, setToken } from '@/app/_shared/auth/tokenStorage'
import { _setActiveTeamIdInternal } from '@/src/shared/auth/activeTeamStore'

const VALID_TEAM_ID = '11111111-1111-1111-1111-111111111111'

// ---------------------------------------------------------------------------
// Supabase mock — bridges tokenStorage ↔ getSession so existing test
// semantics (setToken / clearToken) keep working with the supabase-based client.
// ---------------------------------------------------------------------------

vi.mock('@/app/_shared/auth/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockImplementation(async () => {
        const token = localStorage.getItem('auth_token')
        return { data: { session: token ? { access_token: token } : null } }
      }),
    },
  },
}))

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
  // Most tests run with a valid active team so the default teamScoped=true path works.
  _setActiveTeamIdInternal(VALID_TEAM_ID)
})

afterEach(() => {
  _setActiveTeamIdInternal(null)
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

// ---------------------------------------------------------------------------
// X-Team-Id / team-scoped behaviour
// ---------------------------------------------------------------------------

describe('request — team scoping', () => {
  it('adds X-Team-Id header when store has a valid active team', async () => {
    _setActiveTeamIdInternal(VALID_TEAM_ID)
    mockFetch.mockReturnValue(jsonResponse(200, {}))

    await request('/v1/templates')

    const [, options] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }]
    expect(options.headers['X-Team-Id']).toBe(VALID_TEAM_ID)
  })

  it('does NOT add X-Team-Id when teamScoped is false', async () => {
    _setActiveTeamIdInternal(VALID_TEAM_ID)
    mockFetch.mockReturnValue(jsonResponse(200, {}))

    await request('/v1/me', { teamScoped: false })

    const [, options] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }]
    expect(options.headers['X-Team-Id']).toBeUndefined()
  })

  it('throws TeamNotSelectedError when teamScoped=true and no active team is set', async () => {
    _setActiveTeamIdInternal(null)

    await expect(request('/v1/templates')).rejects.toBeInstanceOf(TeamNotSelectedError)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does NOT throw TeamNotSelectedError when teamScoped=false and no active team', async () => {
    _setActiveTeamIdInternal(null)
    mockFetch.mockReturnValue(jsonResponse(200, {}))

    await expect(request('/v1/me', { teamScoped: false })).resolves.not.toThrow()
  })

  it('strips manually-supplied X-Team-Id from options.headers', async () => {
    _setActiveTeamIdInternal(VALID_TEAM_ID)
    mockFetch.mockReturnValue(jsonResponse(200, {}))

    await request('/v1/templates', {
      headers: { 'X-Team-Id': 'evil-injected-id' },
    })

    const [, options] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }]
    // The injected value must be replaced with the store value, not the caller's
    expect(options.headers['X-Team-Id']).toBe(VALID_TEAM_ID)
    expect(options.headers['X-Team-Id']).not.toBe('evil-injected-id')
  })

  it('throws StaleTeamRequestError when active team changes mid-flight', async () => {
    const OTHER_TEAM_ID = '22222222-2222-2222-2222-222222222222'
    _setActiveTeamIdInternal(VALID_TEAM_ID)

    // Simulate team switch happening while the fetch is in progress.
    mockFetch.mockImplementation(async () => {
      _setActiveTeamIdInternal(OTHER_TEAM_ID)
      return jsonResponse(200, { id: 1 })
    })

    await expect(request('/v1/templates')).rejects.toBeInstanceOf(StaleTeamRequestError)
  })
})
