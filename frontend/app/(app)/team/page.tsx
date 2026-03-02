'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { request } from '@/app/_shared/api/httpClient'
import { Button } from '@/app/_shared/components/Button'
import type { CreateInviteResponse } from '@/app/_shared/api/types'
import { FunnelStatsCard } from '@/src/features/analytics/FunnelStatsCard'
import { TeamOverviewCards } from '@/src/features/dashboard/TeamOverviewCards'
import { useAuth } from '@/src/shared/auth/AuthContext'

type InviteState = {
  url: string | null
  generating: boolean
  copied: boolean
  error: string | null
}

const EMPTY_INVITE: InviteState = { url: null, generating: false, copied: false, error: null }

export default function TeamPage() {
  const router = useRouter()
  const { me, role, activeTeamId, loading: authLoading } = useAuth()
  const [inviteStates, setInviteStates] = useState<Record<string, InviteState>>({})

  // UX guard: ATHLETE should not access team page (backend RBAC is the real authority).
  useEffect(() => {
    if (!authLoading && role === 'ATHLETE') {
      router.replace('/sessions')
    }
  }, [authLoading, role, router])

  const isCoach = role === 'COACH'

  function getInvite(teamId: string): InviteState {
    return inviteStates[teamId] ?? EMPTY_INVITE
  }

  function patchInvite(teamId: string, patch: Partial<InviteState>) {
    setInviteStates((prev) => ({
      ...prev,
      [teamId]: { ...(prev[teamId] ?? EMPTY_INVITE), ...patch },
    }))
  }

  async function handleGenerate(teamId: string) {
    patchInvite(teamId, { generating: true, error: null })
    try {
      const result = await request<CreateInviteResponse>('/v1/invites', {
        method: 'POST',
        body: JSON.stringify({ team_id: teamId }),
      })
      patchInvite(teamId, { url: result.join_url, generating: false, copied: false })
    } catch {
      patchInvite(teamId, { generating: false, error: 'Could not generate invite link. Please try again.' })
    }
  }

  async function handleCopy(teamId: string) {
    const url = getInvite(teamId).url
    if (!url) return
    await navigator.clipboard.writeText(url)
    patchInvite(teamId, { copied: true })
    setTimeout(() => patchInvite(teamId, { copied: false }), 2000)
  }

  if (authLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (!me || me.memberships.length === 0) return <p className="text-sm text-slate-400">No team found.</p>

  return (
    <>
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Teams</h1>
        <div className="flex items-center gap-3">
          {isCoach && (
            <Link
              href="/create-team"
              className="rounded-md bg-[#4f9cf9]/20 px-3 py-1.5 text-sm font-medium text-[#4f9cf9] hover:bg-[#4f9cf9]/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              + New team
            </Link>
          )}
        </div>
      </div>


      {/* Active-team dashboard widgets */}
      {isCoach && <TeamOverviewCards />}
      {isCoach && <FunnelStatsCard />}

      {/* Per-team cards */}
      <div className="mt-6 space-y-4">
        {me.memberships.map((membership) => {
          const invite = getInvite(membership.team_id)
          return (
            <div
              key={membership.team_id}
              className="rounded-lg border border-white/8 bg-[#131922] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white">{membership.team_name}</p>
                    {activeTeamId === membership.team_id && (
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs capitalize text-slate-400">
                    {membership.role.toLowerCase()}
                  </p>
                </div>
              </div>

              {isCoach && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs text-slate-400">
                    Generate an invite link and share it with your athletes. Each link expires in 7 days.
                  </p>

                  {invite.error && (
                    <p role="alert" className="text-sm text-red-400">
                      {invite.error}
                    </p>
                  )}

                  {invite.url && (
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={invite.url}
                        className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#0d1420] px-3 py-2 text-sm text-slate-300 focus:outline-none"
                      />
                      <Button variant="secondary" onClick={() => handleCopy(membership.team_id)}>
                        {invite.copied ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                  )}

                  <Button
                    onClick={() => handleGenerate(membership.team_id)}
                    disabled={invite.generating}
                    loading={invite.generating}
                  >
                    {invite.url ? 'Generate new link' : 'Generate invite link'}
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
