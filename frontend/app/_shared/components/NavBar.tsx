'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/app/_shared/auth/supabaseClient'
import { useAuth } from '@/src/shared/auth/AuthContext'

export function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { role } = useAuth()
  const isCoach = role === 'COACH'

  function isActive(href: string) {
    return pathname.startsWith(href)
  }

  function handleSignOut() {
    supabase.auth.signOut().then(() => router.replace('/login'))
  }

  const isAthlete = role === 'ATHLETE'

  return (
    <nav className="flex h-14 items-center gap-1 border-b border-white/8 bg-[#131922] px-6">
      <div className="mr-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#4f9cf9]/20">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-[#4f9cf9]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-white">MBS Football</span>
      </div>
      <NavLink href="/home" active={isActive('/home')}>
        Home
      </NavLink>
      {isCoach && (
        <NavLink href="/templates" active={isActive('/templates')}>
          Templates
        </NavLink>
      )}
      {isAthlete && (
        <NavLink href="/athlete" active={isActive('/athlete')}>
          Training
        </NavLink>
      )}
      <NavLink href="/sessions" active={isActive('/sessions')}>
        Sessions
      </NavLink>
      {isCoach && (
        <NavLink href="/exercises" active={isActive('/exercises')}>
          Exercises
        </NavLink>
      )}
      {isCoach && (
        <NavLink href="/team" active={isActive('/team')}>
          Team
        </NavLink>
      )}
      <div className="ml-auto">
        <button
          onClick={handleSignOut}
          className="rounded-md px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}

function NavLink({
  href,
  children,
  active,
}: {
  href: string
  children: React.ReactNode
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'text-[#4f9cf9]'
          : 'text-slate-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      {children}
    </Link>
  )
}
