'use client'

import { useEffect, useState } from 'react'
import { CreateButton } from '@/app/_shared/components/CreateButton'
import { PageHeader } from '@/app/_shared/components/PageHeader'
import { useRouter } from 'next/navigation'
import { request, ForbiddenError } from '@/app/_shared/api/httpClient'
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

// ---------------------------------------------------------------------------
// Delete Team Modal
// ---------------------------------------------------------------------------

function DeleteTeamModal({
  teamName,
  deleting,
  error,
  onConfirm,
  onCancel,
}: {
  teamName: string
  deleting: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const matches = confirmText.trim() === teamName.trim()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-team-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
    >
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#131922] p-6 shadow-2xl">
        <h2 id="delete-team-modal-title" className="text-base font-semibold text-white">
          Delete Team
        </h2>

        <div className="mt-3 text-xs text-slate-400 space-y-2">
          <p>Deleting this team will permanently remove:</p>
          <ul className="ml-4 list-disc space-y-0.5">
            <li>all team memberships</li>
            <li>all workout templates</li>
            <li>all workout sessions and logs</li>
            <li>invites and media assets</li>
          </ul>
          <p className="font-semibold text-red-400">This action cannot be undone.</p>
        </div>

        <div className="mt-4">
          <label htmlFor="delete-confirm-input" className="block text-xs text-slate-400 mb-1.5">
            Type <strong className="text-white">{teamName}</strong> to confirm
          </label>
          <input
            id="delete-confirm-input"
            type="text"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type the team name to confirm"
            disabled={deleting}
            className="w-full rounded-md border border-white/10 bg-[#0d1420] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50"
          />
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            size="sm"
            disabled={!matches || deleting}
            loading={deleting}
            onClick={onConfirm}
            className="flex-1"
          >
            Delete team
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={deleting}
            onClick={onCancel}
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Team Page
// ---------------------------------------------------------------------------

export default function TeamPage() {
  const router = useRouter()
  const { me, role, activeTeamId, loading: authLoading, clearActiveTeam, refreshMe } = useAuth()
  const [invite, setInvite] = useState<InviteState>(EMPTY_INVITE)
  const [athletesState, setAthletesState] = useState<AthletesState>({ status: 'loading' })
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteState, setDeleteState] = useState<{ deleting: boolean; error: string | null }>({
    deleting: false,
    error: null,
  })

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
  const isOwner = activeTeam?.is_owner === true

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

  async function handleDeleteTeam() {
    if (!activeTeamId) return
    setDeleteState({ deleting: true, error: null })
    try {
      await request<void>(`/v1/teams/${activeTeamId}`, { method: 'DELETE' })
      clearActiveTeam()
      try {
        const freshMe = await refreshMe()
        if (freshMe.memberships.length === 0) {
          router.replace('/create-team')
        } else {
          router.replace('/team/select')
        }
      } catch {
        // refreshMe failed — redirect to /team/select and let bootstrap fix state
        router.replace('/team/select')
      }
    } catch (err) {
      if (err instanceof ForbiddenError) {
        setDeleteState({ deleting: false, error: err.message })
      } else {
        setDeleteState({ deleting: false, error: 'Something went wrong. Please try again.' })
      }
    }
  }

  if (authLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (!me || !activeTeam) return <p className="text-sm text-slate-400">No team found.</p>

  const athletes = athletesState.status === 'ok' ? athletesState.data : []

  return (
    <>
      <PageHeader
        title="Teams"
        actions={isCoach ? (
          <CreateButton href="/create-team">New team</CreateButton>
        ) : undefined}
      />

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

      {/* Danger Zone — only visible to team owner */}
      {isCoach && isOwner && (
        <div className="mt-6 rounded-lg border border-red-500/20 bg-[#131922]">
          <div className="px-5 py-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-red-400">
              Danger zone
            </p>
            <p className="mb-3 text-xs text-slate-400">
              Permanently delete this team and all its data. This action cannot be undone.
            </p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setDeleteState({ deleting: false, error: null })
                setShowDeleteModal(true)
              }}
            >
              Delete team
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <DeleteTeamModal
          teamName={activeTeam.team_name}
          deleting={deleteState.deleting}
          error={deleteState.error}
          onConfirm={handleDeleteTeam}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </>
  )
}
