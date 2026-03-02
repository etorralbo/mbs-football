'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { request } from '@/app/_shared/api/httpClient'
import { Button } from '@/app/_shared/components/Button'
import type { CreateInviteResponse } from '@/app/_shared/api/types'
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
  const [invite, setInvite] = useState<InviteState>(EMPTY_INVITE)

  // UX guard: ATHLETE should not access team page (backend RBAC is the real authority).
  useEffect(() => {
    if (!authLoading && role === 'ATHLETE') {
      router.replace('/sessions')
    }
  }, [authLoading, role, router])

  const isCoach = role === 'COACH'
  const activeTeam = me?.memberships.find((m) => m.team_id === activeTeamId)

  async function handleGenerate() {
    setInvite((prev) => ({ ...prev, generating: true, error: null }))
    try {
      const result = await request<CreateInviteResponse>('/v1/invites', {
        method: 'POST',
        body: JSON.stringify({ team_id: activeTeamId }),
      })
      setInvite({ url: result.join_url, generating: false, copied: false, error: null })
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

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Teams</h1>
        {isCoach && (
          <Link
            href="/create-team"
            className="rounded-md bg-[#4f9cf9]/20 px-3 py-1.5 text-sm font-medium text-[#4f9cf9] hover:bg-[#4f9cf9]/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
          >
            + New team
          </Link>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-white/8 bg-[#131922] p-5">
        <div>
          <p className="font-semibold text-white">{activeTeam.team_name}</p>
          <p className="mt-0.5 text-xs capitalize text-slate-400">
            {activeTeam.role.toLowerCase()}
          </p>
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
                <Button variant="secondary" onClick={handleCopy}>
                  {invite.copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            )}

            <Button onClick={handleGenerate} disabled={invite.generating} loading={invite.generating}>
              {invite.url ? 'Generate new link' : 'Generate invite link'}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
