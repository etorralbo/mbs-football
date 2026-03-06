'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { useAuth } from '@/src/shared/auth/AuthContext'

function TeamAvatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name.slice(0, 2).toUpperCase()

  if (size === 'sm') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#c8f135]/20 text-[9px] font-bold text-[#c8f135]">
        {initials}
      </span>
    )
  }

  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#c8f135]/15 text-[10px] font-bold text-[#c8f135]">
      {initials}
    </span>
  )
}

export function TeamSwitcher() {
  const { me, role, activeTeamId, setActiveTeamId } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const coachTeams = me?.memberships.filter((membership) => membership.role === 'COACH') ?? []
  const activeTeam = coachTeams.find((membership) => membership.team_id === activeTeamId)
  const canSwitch = coachTeams.length > 1

  useEffect(() => {
    if (!open) return

    function handleMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  if (role !== 'COACH' || !me || !activeTeam) return null

  function handleSelectTeam(teamId: string) {
    setActiveTeamId(teamId)
    setOpen(false)

    // TeamPageContent uses key={activeTeamId} so the page content remounts
    // automatically on team change, re-running all data hooks.
    // Only explicit navigation is needed when still on the picker page itself.
    if (pathname === '/team/select') {
      router.replace('/dashboard')
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => canSwitch && setOpen((current) => !current)}
        aria-haspopup={canSwitch ? 'listbox' : undefined}
        aria-expanded={canSwitch ? open : undefined}
        aria-label={canSwitch ? `Active team: ${activeTeam.team_name}. Click to switch.` : `Active team: ${activeTeam.team_name}`}
        className={[
          'flex items-center gap-2 rounded-md border border-white/10 bg-[#0d1420] px-3 py-1.5 text-sm transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
          canSwitch
            ? 'cursor-pointer hover:border-white/20 hover:bg-white/5'
            : 'cursor-default',
        ].join(' ')}
      >
        <TeamAvatar name={activeTeam.team_name} size="sm" />
        <span className="max-w-[120px] truncate font-medium text-white">{activeTeam.team_name}</span>
        {canSwitch && (
          <svg
            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {canSwitch && open && (
        <div
          role="listbox"
          aria-label="Switch team"
          className="absolute left-0 top-full z-50 mt-1.5 w-56 rounded-lg border border-white/10 bg-[#131922] py-1 shadow-xl shadow-black/50"
        >
          <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Your teams
          </p>
          {coachTeams.map((team) => {
            const isActive = team.team_id === activeTeamId
            return (
              <button
                key={team.team_id}
                role="option"
                aria-selected={isActive}
                type="button"
                onClick={() => handleSelectTeam(team.team_id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <TeamAvatar name={team.team_name} size="md" />
                <span className={`flex-1 truncate ${isActive ? 'font-medium text-white' : 'text-slate-300'}`}>
                  {team.team_name}
                </span>
                {isActive && (
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-[#c8f135]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )
          })}

          <div className="mx-3 my-1 border-t border-white/8" />

          <Link
            href="/create-team"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-dashed border-white/20 text-slate-500">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </span>
            Create a new team
          </Link>
        </div>
      )}
    </div>
  )
}
