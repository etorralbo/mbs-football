'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { Button } from '@/app/_shared/components/Button'
import type { MeResponse, CreateInviteResponse } from '@/app/_shared/api/types'
import { FunnelStatsCard } from '@/src/features/analytics/FunnelStatsCard'

export default function TeamPage() {
  const router = useRouter()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    request<MeResponse>('/v1/me')
      .then(setMe)
      .catch((err: unknown) => {
        try {
          handleApiError(err, router)
        } catch {
          // ignore — page will show empty state
        }
      })
      .finally(() => setLoading(false))
  }, [router])

  const membership = me?.memberships[0] ?? null
  const isCoach = membership?.role === 'COACH'

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

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>
  if (!membership) return <p className="text-sm text-zinc-500">No team found.</p>

  return (
    <>
      <h1 className="text-xl font-semibold text-zinc-900">{membership.team_name}</h1>
      <p className="mt-1 text-sm text-zinc-500 capitalize">{membership.role.toLowerCase()}</p>

      {isCoach && <FunnelStatsCard />}

      {isCoach && (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Invite athletes</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Generate a link and share it with your athletes. Each link expires in 7 days.
          </p>

          <div className="mt-4 space-y-3">
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            {inviteUrl && (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 focus:outline-none"
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
