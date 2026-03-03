'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { request } from '@/app/_shared/api/httpClient'
import { Button } from '@/app/_shared/components/Button'
import type { CreateInviteResponse } from '@/app/_shared/api/types'
import { useAuth } from '@/src/shared/auth/AuthContext'

interface Athlete {
  athlete_id: string
  display_name: string
}

type InviteState = {
  url: string | null
  expiresAt: string | null
  generating: boolean
  copied: boolean
  error: string | null
}

type AthletesState =
  | { status: 'loading' }
  | { status: 'ok'; data: Athlete[] }
  | { status: 'error' }

const EMPTY_INVITE: InviteState = { url: null, expiresAt: null, generating: false, copied: false, error: null }

export default function TeamPage() {
  const router = useRouter()
  const { me, role, activeTeamId, loading: authLoading } = useAuth()
  const [invite, setInvite] = useState<InviteState>(EMPTY_INVITE)
  const [athletesState, setAthletesState] = useState<AthletesState>({ status: 'loading' })

  // UX guard: ATHLETE should not access team page (backend RBAC is the real authority).
  useEffect(() => {
    if (!authLoading && role === 'ATHLETE') {
      router.replace('/sessions')
    }
  }, [authLoading, role, router])

  // Fetch athletes for the active team. Runs when role is resolved so the
  // X-Team-Id header is guaranteed to be set in the module store.
  useEffect(() => {
    if (role !== 'COACH') return
    let cancelled = false
    request<Athlete[]>('/v1/athletes')
      .then((data) => { if (!cancelled) setAthletesState({ status: 'ok', data }) })
      .catch(() => { if (!cancelled) setAthletesState({ status: 'error' }) })
    return () => { cancelled = true }
  }, [role])

  const isCoach = role === 'COACH'
  const activeTeam = me?.memberships.find((m) => m.team_id === activeTeamId)

  async function handleGenerate() {
    setInvite((prev) => ({ ...prev, generating: true, error: null }))
    try {
      const result = await request<CreateInviteResponse>('/v1/team-invites', {
        method: 'POST',
        body: JSON.stringify({ team_id: activeTeamId }),
      })
      setInvite({ url: result.join_url, expiresAt: result.expires_at, generating: false, copied: false, error: null })
    } catch {
      setInvite((prev) => ({
        ...prev,
        generating: false,
        error: 'Could not generate invite link. Please try again.',
      }))
    }
  }

  async function handleCopy() {
    if (!invite.url) return
    await navigator.clipboard.writeText(invite.url)
    setInvite((prev) => ({ ...prev, copied: true }))
    setTimeout(() => setInvite((prev) => ({ ...prev, copied: false })), 2000)
  }

  if (authLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (!me || !activeTeam) return <p className="text-sm text-slate-400">No team found.</p>

  const athletes = athletesState.status === 'ok' ? athletesState.data : []

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Team</h1>
        {isCoach && (
          <Link
            href="/create-team"
            className="rounded-md bg-[#4f9cf9]/20 px-3 py-1.5 text-sm font-medium text-[#4f9cf9] hover:bg-[#4f9cf9]/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
          >
            + New team
          </Link>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-white/8 bg-[#131922]">
        {/* Team header */}
        <div className="px-5 pt-5 pb-4">
          <p className="font-semibold text-white">{activeTeam.team_name}</p>
          <p className="mt-0.5 text-xs capitalize text-slate-400">
            {activeTeam.role.toLowerCase()}
          </p>
        </div>

        {/* Athletes section — COACH only */}
        {isCoach && (
          <>
            <div className="border-t border-white/8 px-5 py-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                Athletes
                {athletesState.status === 'ok' && athletes.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                    {athletes.length}
                  </span>
                )}
              </p>

              {athletesState.status === 'loading' && (
                <div className="space-y-2" aria-label="Loading athletes">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <div className="h-7 w-7 animate-pulse rounded-full bg-white/8" />
                      <div className="h-3 w-32 animate-pulse rounded bg-white/8" />
                    </div>
                  ))}
                </div>
              )}

              {athletesState.status === 'error' && (
                <p role="alert" className="text-xs text-red-400">Could not load athletes.</p>
              )}

              {athletesState.status === 'ok' && athletes.length === 0 && (
                <p className="text-xs text-slate-500">
                  No athletes yet — share the invite link below to get started.
                </p>
              )}

              {athletesState.status === 'ok' && athletes.length > 0 && (
                <ul className="space-y-1.5">
                  {athletes.map((athlete) => (
                    <li key={athlete.athlete_id} className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-[10px] font-semibold text-slate-300">
                        {athlete.display_name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="text-sm text-slate-200">{athlete.display_name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Invite section */}
            <div className="border-t border-white/8 px-5 py-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                Invite link
              </p>
              <p className="mb-3 text-xs text-slate-400">
                Generate an invite link and share it with your athletes. Each link expires in 7 days.
              </p>

              {invite.error && (
                <p role="alert" className="mb-3 text-sm text-red-400">
                  {invite.error}
                </p>
              )}

              {invite.url && (
                <div className="mb-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={invite.url}
                      className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#0d1420] px-3 py-2 text-sm text-slate-300 focus:outline-none"
                    />
                    <Button variant="secondary" onClick={handleCopy}>
                      {invite.copied ? 'Copied!' : 'Copy invite link'}
                    </Button>
                  </div>
                  {invite.expiresAt && (
                    <p className="text-xs text-slate-500">
                      Expires{' '}
                      {new Date(invite.expiresAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                </div>
              )}

              <Button onClick={handleGenerate} disabled={invite.generating} loading={invite.generating}>
                {invite.url ? 'Generate new link' : 'Generate invite link'}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
