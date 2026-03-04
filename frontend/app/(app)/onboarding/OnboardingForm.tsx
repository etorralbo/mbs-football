'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { request, UnauthorizedError, ConflictError } from '@/app/_shared/api/httpClient'
import { supabase } from '@/app/_shared/auth/supabaseClient'
import type { MeResponse, AcceptInviteResponse } from '@/app/_shared/api/types'

const TOKEN_MAX_AGE_MS = 30 * 60 * 1000

/**
 * Deterministic onboarding router guard.
 *
 * - Has membership          → /sessions
 * - Pending invite token    → accept invite → /sessions?welcome=1
 * - Token expired/invalid   → /invite-invalid
 * - No token                → /create-team  (coach path)
 * - Unauthorized            → /login
 */
export function OnboardingHub() {
  const router = useRouter()
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const hasToken = !!localStorage.getItem('pending_invite_token')

    request<MeResponse>('/v1/me', { teamScoped: false })
      .then((me) => {
        if (me.memberships.length > 0) {
          router.replace('/sessions')
          return
        }
        handleNoMemberships()
      })
      .catch((err) => {
        if (err instanceof UnauthorizedError) {
          router.replace('/login')
        } else if (hasToken) {
          // Invite flow but can't reach API — clean up token to prevent loop
          localStorage.removeItem('pending_invite_token')
          localStorage.removeItem('pending_invite_token_at')
          router.replace('/invite-invalid')
        } else {
          router.replace('/create-team')
        }
      })

    async function handleNoMemberships() {
      const token = localStorage.getItem('pending_invite_token')
      const tokenAt = localStorage.getItem('pending_invite_token_at')

      // No token → coach path
      if (!token) {
        router.replace('/create-team')
        return
      }

      // Expired token (> 30 min) → clear and invite-invalid
      // Missing tokenAt is treated as legacy — still try accept.
      if (tokenAt && Date.now() - parseInt(tokenAt, 10) > TOKEN_MAX_AGE_MS) {
        localStorage.removeItem('pending_invite_token')
        localStorage.removeItem('pending_invite_token_at')
        router.replace('/invite-invalid')
        return
      }

      // Valid token → accept invite
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const meta = user?.user_metadata
        const displayName =
          (meta?.name ?? meta?.full_name ?? user?.email?.split('@')[0] ?? '').trim()

        const result = await request<AcceptInviteResponse>(
          `/v1/team-invites/${encodeURIComponent(token)}/accept`,
          {
            method: 'POST',
            body: JSON.stringify({ display_name: displayName }),
            teamScoped: false,
          },
        )

        localStorage.removeItem('pending_invite_token')
        localStorage.removeItem('pending_invite_token_at')

        if (result.status === 'joined') {
          sessionStorage.setItem('welcome_team_name', result.team_name)
          router.replace('/sessions?welcome=1')
        } else {
          // already_member or not_eligible — redirect to sessions
          router.replace('/sessions')
        }
      } catch (err) {
        localStorage.removeItem('pending_invite_token')
        localStorage.removeItem('pending_invite_token_at')
        // 409 = invite already used (user already accepted) → dashboard
        if (err instanceof ConflictError) {
          router.replace('/sessions')
        } else {
          // 404/410/other → invite is invalid/expired
          router.replace('/invite-invalid')
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col items-center gap-3 pt-10" aria-busy="true">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#4f9cf9] border-t-transparent" />
      <p className="text-sm text-slate-400">Setting up your account…</p>
    </div>
  )
}
