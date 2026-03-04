'use client'

import { useAuth } from '@/src/shared/auth/AuthContext'

/**
 * Wraps page content with a key tied to the active team.
 * When the team changes, React unmounts and remounts the whole subtree,
 * so every data hook (even those with empty deps) re-fetches for the new team.
 */
export function TeamPageContent({ children }: { children: React.ReactNode }) {
  const { activeTeamId } = useAuth()

  return (
    <div key={activeTeamId ?? 'no-team'} className="p-8">
      {children}
    </div>
  )
}
