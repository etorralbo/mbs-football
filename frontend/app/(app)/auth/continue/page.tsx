'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  request,
  NotFoundError,
  GoneError,
  ConflictError,
  ForbiddenError,
} from '@/app/_shared/api/httpClient'
import { supabase } from '@/app/_shared/auth/supabaseClient'
import type { AcceptInviteResponse } from '@/app/_shared/api/types'

type Phase = 'loading' | 'joining' | 'already_member' | 'error'

/**
 * /auth/continue
 *
 * Reads the pending_invite_token from localStorage, calls the accept endpoint,
 * then redirects or shows the appropriate UI:
 *
 *   joined         → /sessions?welcome=<team_name>
 *   already_member → "Este enlace es para invitar a atletas" screen
 *   error          → inline error message
 *
 * RequireAuth (wrapping the (app) group) ensures the user is authenticated
 * before this page renders.  Unauthenticated users are redirected to
 * /login?next=/auth/continue and land back here after signing in.
 */
export default function AuthContinuePage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [alreadyMemberTeamName, setAlreadyMemberTeamName] = useState('')
  const inviteUrl = useRef('')
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const token = localStorage.getItem('pending_invite_token')
    if (!token) {
      router.replace('/sessions')
      return
    }

    // Build invite URL for "Copy link" button (best-effort).
    inviteUrl.current = `${window.location.origin}/join/${token}`

    setPhase('joining')

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      const meta = user?.user_metadata
      const displayName =
        (meta?.name ?? meta?.full_name ?? user?.email?.split('@')[0] ?? '').trim()

      try {
        const result = await request<AcceptInviteResponse>(
          `/v1/team-invites/${encodeURIComponent(token)}/accept`,
          {
            method: 'POST',
            body: JSON.stringify({ display_name: displayName }),
            teamScoped: false,
          },
        )

        localStorage.removeItem('pending_invite_token')

        if (result.status === 'already_member') {
          setAlreadyMemberTeamName(result.team_name)
          setPhase('already_member')
        } else {
          // joined
          router.replace(`/sessions?welcome=${encodeURIComponent(result.team_name)}`)
        }
      } catch (err) {
        localStorage.removeItem('pending_invite_token')

        if (err instanceof NotFoundError) {
          setErrorMessage('El enlace no es válido o ha caducado. Pide uno nuevo al coach.')
        } else if (err instanceof GoneError) {
          setErrorMessage('El enlace ha caducado. Pide uno nuevo al coach.')
        } else if (err instanceof ConflictError) {
          setErrorMessage('Este enlace ya ha sido utilizado. Pide uno nuevo al coach.')
        } else if (err instanceof ForbiddenError) {
          setErrorMessage('Este enlace es para atletas. Los coaches no pueden unirse con él.')
        } else {
          setErrorMessage('Algo ha ido mal. Inténtalo de nuevo o pide un nuevo enlace.')
        }
        setPhase('error')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Loading / joining ────────────────────────────────────────────────────
  if (phase === 'loading' || phase === 'joining') {
    return (
      <div className="flex flex-col items-center gap-3 pt-10" aria-busy="true">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#4f9cf9] border-t-transparent" />
        <p className="text-sm text-slate-400">
          {phase === 'joining' ? 'Uniéndote al equipo…' : 'Cargando…'}
        </p>
      </div>
    )
  }

  // ── Already member ───────────────────────────────────────────────────────
  if (phase === 'already_member') {
    return (
      <div className="mx-auto max-w-sm space-y-5 pt-10 text-center">
        <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-[#4f9cf9]/15">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-7 w-7 text-[#4f9cf9]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">
            Este enlace es para invitar a atletas
          </h1>
          {alreadyMemberTeamName && (
            <p className="mt-1.5 text-sm text-slate-400">
              Ya eres miembro de{' '}
              <span className="font-medium text-white">{alreadyMemberTeamName}</span>.
            </p>
          )}
          <p className="mt-1 text-sm text-slate-500">
            Comparte este enlace con los atletas que quieras invitar.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              if (inviteUrl.current) {
                navigator.clipboard.writeText(inviteUrl.current).catch(() => {})
              }
            }}
            className="w-full rounded-md border border-white/15 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-white/30 hover:text-white"
          >
            Copiar enlace
          </button>
          <button
            type="button"
            onClick={() => router.replace('/sessions')}
            className="w-full rounded-md bg-[#4f9cf9]/20 px-4 py-2.5 text-sm font-medium text-[#4f9cf9] transition-colors hover:bg-[#4f9cf9]/30"
          >
            Ir a mi dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-sm space-y-4 pt-10">
      <h1 className="text-xl font-semibold text-white">No se pudo unir al equipo</h1>
      <p role="alert" className="text-sm text-red-400">{errorMessage}</p>
      <button
        type="button"
        onClick={() => router.replace('/sessions')}
        className="text-sm text-[#4f9cf9] hover:underline"
      >
        Ir a mi dashboard
      </button>
    </div>
  )
}
