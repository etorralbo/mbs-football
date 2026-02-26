'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { request, UnauthorizedError } from '@/app/_shared/api/httpClient'
import type { MeResponse } from '@/app/_shared/api/types'

/**
 * Onboarding hub: checks memberships and routes the user accordingly.
 *
 * - Already has membership → redirect to /templates
 * - No membership         → show two CTAs: Create Team (COACH) / Join Team (ATHLETE)
 */
export function OnboardingHub() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    request<MeResponse>('/v1/me')
      .then((me) => {
        if (me.memberships.length > 0) {
          router.replace('/templates')
        } else {
          setChecking(false)
        }
      })
      .catch((err) => {
        if (err instanceof UnauthorizedError) {
          router.replace('/login')
        } else {
          // On unexpected errors still show the CTAs so the user isn't stuck.
          setChecking(false)
        }
      })
  }, [router])

  if (checking) return null

  return (
    <div className="mt-6 flex flex-col gap-4 sm:flex-row">
      <button
        onClick={() => router.push('/create-team')}
        className="flex flex-1 flex-col items-center gap-3 rounded-lg border-2 border-indigo-200 bg-indigo-50 p-6 text-left transition hover:border-indigo-400 hover:bg-indigo-100"
      >
        <span className="text-3xl">🏋️</span>
        <div>
          <p className="font-semibold text-zinc-900">I&apos;m a Coach</p>
          <p className="mt-1 text-sm text-zinc-500">
            Create a team and manage your athletes.
          </p>
        </div>
      </button>

      <button
        onClick={() => router.push('/join')}
        className="flex flex-1 flex-col items-center gap-3 rounded-lg border-2 border-emerald-200 bg-emerald-50 p-6 text-left transition hover:border-emerald-400 hover:bg-emerald-100"
      >
        <span className="text-3xl">🏃</span>
        <div>
          <p className="font-semibold text-zinc-900">I&apos;m an Athlete</p>
          <p className="mt-1 text-sm text-zinc-500">
            Join a team using an invite code from your coach.
          </p>
        </div>
      </button>
    </div>
  )
}
