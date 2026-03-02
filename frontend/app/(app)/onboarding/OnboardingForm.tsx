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
          router.replace('/home')
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
        className="flex flex-1 flex-col items-center gap-3 rounded-lg border-2 border-[#4f9cf9]/30 bg-[#4f9cf9]/8 p-6 text-left transition hover:border-[#4f9cf9]/50 hover:bg-[#4f9cf9]/12"
      >
        <span className="text-3xl">🏋️</span>
        <div>
          <p className="font-semibold text-white">I&apos;m a Coach</p>
          <p className="mt-1 text-sm text-slate-400">
            Create a team and manage your athletes.
          </p>
        </div>
      </button>

      <button
        onClick={() => router.push('/join')}
        className="flex flex-1 flex-col items-center gap-3 rounded-lg border-2 border-[#c8f135]/20 bg-[#c8f135]/8 p-6 text-left transition hover:border-[#c8f135]/35 hover:bg-[#c8f135]/12"
      >
        <span className="text-3xl">🏃</span>
        <div>
          <p className="font-semibold text-white">I&apos;m an Athlete</p>
          <p className="mt-1 text-sm text-slate-400">
            Join a team using an invite code from your coach.
          </p>
        </div>
      </button>
    </div>
  )
}
