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

export default function TeamPage() {
  const router = useRouter()
  const { me, role, activeTeamId, loading: authLoading } = useAuth()
  const [generating, setGenerating] = useState(false)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // UX guard: ATHLETE should not access team page (backend RBAC is the real authority).
  useEffect(() => {
    if (!authLoading && role === 'ATHLETE') {
      router.replace('/sessions')
    }
  }, [authLoading, role, router])

  // For multi-team coaches, show the currently active team, not always [0].
  const membership =
    me?.memberships.find((m) => m.team_id === activeTeamId) ??
    me?.memberships[0] ??
    null
  const isCoach = role === 'COACH'

  async function handleGenerate() {
    if (!membership) return
    setError(null)
    setGenerating(true)
    try {
      const result = await request<CreateInviteResponse>('/v1/invites', {
        method: 'POST',
        body: JSON.stringify({ team_id: membership.team_id }),
      })
      setInviteUrl(result.join_url)
      setCopied(false)
    } catch {
      setError('Could not generate invite link. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (authLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (!membership) return <p className="text-sm text-slate-400">No team found.</p>

  return (
    <>
      <h1 className="text-xl font-semibold text-white">{membership.team_name}</h1>
      <p className="mt-1 text-sm text-slate-400 capitalize">{membership.role.toLowerCase()}</p>

      {isCoach && <TeamOverviewCards />}

      {isCoach && <FunnelStatsCard />}

      {isCoach && (
        <div className="mt-6 rounded-lg border border-white/8 bg-[#131922] p-5">
          <h2 className="text-sm font-semibold text-white">Manage teams</h2>
          <p className="mt-1 text-xs text-slate-400">
            Create another team to manage separate groups of athletes.
          </p>
          <Link
            href="/create-team"
            className="mt-3 inline-block text-sm text-indigo-400 hover:text-indigo-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
          >
            + Create a new team
          </Link>
        </div>
      )}

      {isCoach && (
        <div className="mt-6 rounded-lg border border-white/8 bg-[#131922] p-5">
          <h2 className="text-sm font-semibold text-white">Invite athletes</h2>
          <p className="mt-1 text-xs text-slate-400">
            Generate a link and share it with your athletes. Each link expires in 7 days.
          </p>

          <div className="mt-4 space-y-3">
            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}

            {inviteUrl && (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#0d1420] px-3 py-2 text-sm text-slate-300 focus:outline-none"
                />
                <Button variant="secondary" onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            )}

            <Button onClick={handleGenerate} disabled={generating} loading={generating}>
              {inviteUrl ? 'Generate new link' : 'Generate invite link'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
