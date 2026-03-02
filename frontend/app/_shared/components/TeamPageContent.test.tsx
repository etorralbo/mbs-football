/**
 * Tests for TeamPageContent's key-based remount strategy.
 *
 * What we verify:
 *   1. React layer  — children unmount and remount when activeTeamId changes.
 *   2. Network layer — the re-mounted data hook fires a fetch with the new X-Team-Id header.
 *
 * Setup mirrors httpClient.test.ts:
 *   - supabaseClient is mocked so request() can obtain an auth token
 *   - global fetch is stubbed with mockFetch
 *   - _setActiveTeamIdInternal (real module) seeds the activeTeamStore
 *   - useAuth is mocked via a module-level variable to control what TeamPageContent renders
 */

import { render, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { useEffect } from 'react'
import { TeamPageContent } from './TeamPageContent'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAM_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TEAM_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

// ---------------------------------------------------------------------------
// Mock: useAuth — module-level variable drives what TeamPageContent renders.
// The real AuthProvider also calls _setActiveTeamIdInternal when switching;
// tests that verify fetch headers must mirror that by calling it explicitly.
// ---------------------------------------------------------------------------

let currentActiveTeamId: string | null = TEAM_A

vi.mock('@/src/shared/auth/AuthContext', () => ({
  useAuth: () => ({ activeTeamId: currentActiveTeamId }),
}))

// ---------------------------------------------------------------------------
// Mock: supabaseClient — lets httpClient resolve a Bearer token from localStorage
// (same pattern as httpClient.test.ts)
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
// Stub: global fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function jsonOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: (key: string) => (key === 'content-type' ? 'application/json' : null) },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

// ---------------------------------------------------------------------------
// Real imports (activeTeamStore and httpClient are NOT mocked here)
// ---------------------------------------------------------------------------

import { _setActiveTeamIdInternal } from '@/src/shared/auth/activeTeamStore'
import { setToken, clearToken } from '@/app/_shared/auth/tokenStorage'
import { request } from '@/app/_shared/api/httpClient'

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  currentActiveTeamId = TEAM_A
  mockFetch.mockReset()
})

afterEach(() => {
  clearToken()
  _setActiveTeamIdInternal(null)
})

// ---------------------------------------------------------------------------
// Helper: a child that records every mount via a spy
// ---------------------------------------------------------------------------

function makeTrackedChild(mountSpy: ReturnType<typeof vi.fn>) {
  return function TrackedChild() {
    useEffect(() => {
      mountSpy()
    }, [])
    return null
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TeamPageContent — React layer (key-based remount)', () => {
  it('mounts the child exactly once on initial render', () => {
    const mountSpy = vi.fn()
    const Child = makeTrackedChild(mountSpy)

    render(
      <TeamPageContent>
        <Child />
      </TeamPageContent>,
    )

    expect(mountSpy).toHaveBeenCalledTimes(1)
  })

  it('remounts children when activeTeamId changes', () => {
    const mountSpy = vi.fn()
    const Child = makeTrackedChild(mountSpy)

    const { rerender } = render(
      <TeamPageContent>
        <Child />
      </TeamPageContent>,
    )

    expect(mountSpy).toHaveBeenCalledTimes(1)

    currentActiveTeamId = TEAM_B
    rerender(
      <TeamPageContent>
        <Child />
      </TeamPageContent>,
    )

    expect(mountSpy).toHaveBeenCalledTimes(2)
  })

  it('does NOT remount children when activeTeamId stays the same', () => {
    const mountSpy = vi.fn()
    const Child = makeTrackedChild(mountSpy)

    const { rerender } = render(
      <TeamPageContent>
        <Child />
      </TeamPageContent>,
    )

    expect(mountSpy).toHaveBeenCalledTimes(1)

    // Same team — no key change expected
    rerender(
      <TeamPageContent>
        <Child />
      </TeamPageContent>,
    )

    expect(mountSpy).toHaveBeenCalledTimes(1)
  })
})

describe('TeamPageContent — network layer (X-Team-Id header)', () => {
  it('each remount fires a fetch with the current active team header', async () => {
    setToken('test-token')
    _setActiveTeamIdInternal(TEAM_A)
    currentActiveTeamId = TEAM_A
    mockFetch.mockResolvedValue(jsonOk({ ok: true }))

    // A child that issues one team-scoped request on every mount — this is
    // the pattern every real data hook in the app follows (empty deps array).
    function DataChild() {
      useEffect(() => {
        request('/v1/data').catch(() => {})
      }, [])
      return null
    }

    const { rerender } = render(
      <TeamPageContent>
        <DataChild />
      </TeamPageContent>,
    )

    // Flush async work inside request() (supabase.getSession + fetch)
    await act(async () => {})

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, firstOptions] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }]
    expect(firstOptions.headers['X-Team-Id']).toBe(TEAM_A)

    // Simulate what AuthProvider.setActiveTeamId does: update the module store
    // AND trigger a React re-render by updating the useAuth mock.
    _setActiveTeamIdInternal(TEAM_B)
    currentActiveTeamId = TEAM_B

    rerender(
      <TeamPageContent>
        <DataChild />
      </TeamPageContent>,
    )

    await act(async () => {})

    expect(mockFetch).toHaveBeenCalledTimes(2)
    const [, secondOptions] = mockFetch.mock.calls[1] as [string, { headers: Record<string, string> }]
    expect(secondOptions.headers['X-Team-Id']).toBe(TEAM_B)
  })
})
