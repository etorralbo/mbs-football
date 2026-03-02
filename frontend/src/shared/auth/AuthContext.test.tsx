/**
 * Unit tests for AuthContext multi-team logic:
 * - localStorage restore on mount
 * - setActiveTeamId / clearActiveTeam
 * - deriveRole with a resolved team
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { MeResponse } from '@/app/_shared/api/types'
import { AuthProvider, useAuth } from './AuthContext'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// httpClient — we control what /v1/me returns per test
vi.mock('@/app/_shared/api/httpClient', () => ({
  request: vi.fn(),
}))

// activeTeamStore — spy on internal setter but keep real UUID validation
vi.mock('@/src/shared/auth/activeTeamStore', async (importOriginal) => {
  const real = await importOriginal<typeof import('./activeTeamStore')>()
  return {
    ...real,
    _setActiveTeamIdInternal: vi.fn(),
  }
})

import { request } from '@/app/_shared/api/httpClient'
import { _setActiveTeamIdInternal } from '@/src/shared/auth/activeTeamStore'
const mockRequest = vi.mocked(request)
const mockSetActiveTeamIdInternal = vi.mocked(_setActiveTeamIdInternal)

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TEAM_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TEAM_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function meWith({
  activeTeamId,
  memberships,
}: {
  activeTeamId: string | null
  memberships: MeResponse['memberships']
}): MeResponse {
  return {
    user_id: 'user-1',
    active_team_id: activeTeamId,
    memberships,
  }
}

const singleTeamMe = meWith({
  activeTeamId: TEAM_A,
  memberships: [{ team_id: TEAM_A, team_name: 'Team A', role: 'COACH' }],
})

const multiTeamMe = meWith({
  activeTeamId: null,
  memberships: [
    { team_id: TEAM_A, team_name: 'Team A', role: 'COACH' },
    { team_id: TEAM_B, team_name: 'Team B', role: 'COACH' },
  ],
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  localStorage.clear()
})

describe('single-team user', () => {
  it('uses me.active_team_id as activeTeamId', async () => {
    mockRequest.mockResolvedValue(singleTeamMe)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.activeTeamId).toBe(TEAM_A)
    expect(result.current.role).toBe('COACH')
  })

  it('ignores localStorage when server provides active_team_id', async () => {
    localStorage.setItem('activeTeamId', TEAM_B) // stale / irrelevant value
    mockRequest.mockResolvedValue(singleTeamMe)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.activeTeamId).toBe(TEAM_A) // server wins
  })
})

describe('multi-team coach — localStorage restore', () => {
  it('restores activeTeamId from localStorage when team is in memberships', async () => {
    localStorage.setItem('activeTeamId', TEAM_B)
    mockRequest.mockResolvedValue(multiTeamMe)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.activeTeamId).toBe(TEAM_B)
  })

  it('returns null when localStorage teamId is not in memberships (security)', async () => {
    localStorage.setItem('activeTeamId', 'cccccccc-cccc-cccc-cccc-cccccccccccc') // not in me
    mockRequest.mockResolvedValue(multiTeamMe)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.activeTeamId).toBeNull()
  })

  it('returns null when localStorage is empty — Team Picker required', async () => {
    mockRequest.mockResolvedValue(multiTeamMe)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.activeTeamId).toBeNull()
  })
})

describe('setActiveTeamId', () => {
  it('updates activeTeamId and persists to localStorage', async () => {
    mockRequest.mockResolvedValue(multiTeamMe)

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setActiveTeamId(TEAM_A)
    })

    expect(result.current.activeTeamId).toBe(TEAM_A)
    expect(localStorage.getItem('activeTeamId')).toBe(TEAM_A)
    expect(mockSetActiveTeamIdInternal).toHaveBeenCalledWith(TEAM_A)
  })

  it('ignores IDs not in memberships', async () => {
    mockRequest.mockResolvedValue(multiTeamMe)

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setActiveTeamId('cccccccc-cccc-cccc-cccc-cccccccccccc')
    })

    expect(result.current.activeTeamId).toBeNull()
    expect(localStorage.getItem('activeTeamId')).toBeNull()
  })
})

describe('clearActiveTeam', () => {
  it('removes localStorage entry and resets activeTeamId to null', async () => {
    localStorage.setItem('activeTeamId', TEAM_A)
    mockRequest.mockResolvedValue(multiTeamMe)

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    // After restore from localStorage, activeTeamId should be TEAM_A
    expect(result.current.activeTeamId).toBe(TEAM_A)

    act(() => {
      result.current.clearActiveTeam()
    })

    expect(result.current.activeTeamId).toBeNull()
    expect(localStorage.getItem('activeTeamId')).toBeNull()
  })
})

describe('deriveRole with resolved team', () => {
  it('returns COACH role for selected COACH team', async () => {
    localStorage.setItem('activeTeamId', TEAM_A)
    mockRequest.mockResolvedValue(multiTeamMe)

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.role).toBe('COACH')
  })

  it('returns ATHLETE role when selected team has ATHLETE membership', async () => {
    const mixedMe = meWith({
      activeTeamId: null,
      memberships: [
        { team_id: TEAM_A, team_name: 'Team A', role: 'COACH' },
        { team_id: TEAM_B, team_name: 'Team B', role: 'ATHLETE' },
      ],
    })
    localStorage.setItem('activeTeamId', TEAM_B)
    mockRequest.mockResolvedValue(mixedMe)

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.role).toBe('ATHLETE')
  })
})
