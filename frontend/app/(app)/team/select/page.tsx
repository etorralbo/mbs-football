'use client'

/**
 * /team/select — Team Picker
 *
 * Shown when a coach has multiple teams and no active team is set.
 * Athletes never reach this page (TeamSelectGuard only redirects coaches).
 */

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/src/shared/auth/AuthContext'
import { SkeletonList } from '@/app/_shared/components/Skeleton'

const ROLE_LABELS: Record<string, string> = {
  COACH: 'Coach',
  ATHLETE: 'Athlete',
}

export default function TeamSelectPage() {
  const { me, loading, setActiveTeamId } = useAuth()
  const router = useRouter()

  function handleSelect(teamId: string) {
    setActiveTeamId(teamId)
    router.replace('/home')
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="mb-2 text-2xl font-semibold text-white">Select a team</h1>
      <p className="mb-8 text-sm text-slate-400">
        You belong to multiple teams. Choose which one you want to work with.
      </p>

      {loading && <SkeletonList rows={3} />}

      {!loading && me && (
        <ul role="list" className="space-y-3">
          {me.memberships.map((membership) => (
            <li key={membership.team_id}>
              <button
                type="button"
                onClick={() => handleSelect(membership.team_id)}
                className="flex w-full items-center justify-between rounded-lg border border-white/8 bg-[#131922] px-5 py-4 text-left transition-colors hover:border-white/20 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              >
                <div>
                  <p className="text-sm font-medium text-white">
                    {membership.team_name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {ROLE_LABELS[membership.role] ?? membership.role}
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="text-slate-500"
                >
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 border-t border-white/8 pt-6">
        <Link
          href="/create-team"
          className="text-sm text-indigo-400 hover:text-indigo-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
        >
          + Create a new team
        </Link>
      </div>
    </div>
  )
}
