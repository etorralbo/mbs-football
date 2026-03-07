'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/app/_shared/auth/supabaseClient'
import { TeamSwitcher } from '@/app/_shared/components/TeamSwitcher'
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

  return (
    <aside data-testid="app-navbar" className="flex w-64 flex-shrink-0 flex-col border-r border-slate-800 bg-[#0b1117]">
      {/* Branding */}
      <div className="flex items-center gap-3 p-6">
        <Image src="/favicon.svg" alt="Mettle Performance" width={36} height={36} className="h-9 w-9 rounded-lg" />
        <div>
          <h1 className="text-sm font-bold leading-tight text-white">Mettle Performance</h1>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Elite Coach Pro</p>
        </div>
      </div>

      {/* Team switcher */}
      <div className="px-4 pb-4">
        <TeamSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-4" aria-label="Main navigation">
        {isCoach && (
          <SidebarLink href="/dashboard" active={isActive('/dashboard')}>
            <DashboardIcon />
            Dashboard
          </SidebarLink>
        )}
        {isCoach && (
          <SidebarLink href="/templates" active={isActive('/templates')}>
            <TemplatesIcon />
            Templates
          </SidebarLink>
        )}
        <SidebarLink href="/sessions" active={isActive('/sessions')}>
          <SessionsIcon />
          Sessions
        </SidebarLink>
        {isCoach && (
          <SidebarLink href="/exercises" active={isActive('/exercises')}>
            <ExercisesIcon />
            Exercises
          </SidebarLink>
        )}
        {isCoach && (
          <SidebarLink href="/team" active={isActive('/team')}>
            <TeamIcon />
            Teams
          </SidebarLink>
        )}
      </nav>

      {/* Sign out */}
      <div className="border-t border-slate-800 p-4">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <SignOutIcon />
          Sign out
        </button>
      </div>
    </aside>
  )
}

function SidebarLink({
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
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-slate-800 text-[#c8f135]'
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      {children}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Icons (24×24 SVGs from Heroicons)
// ---------------------------------------------------------------------------

function DashboardIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  )
}

function TemplatesIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function SessionsIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
}

function ExercisesIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  )
}

function TeamIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-2.956 9 9 0 10-17.482 0A9.094 9.094 0 008 18.72m10 0a9.094 9.094 0 01-5 1.53 9.094 9.094 0 01-5-1.53m10 0V18a3 3 0 00-3-3h-4a3 3 0 00-3 3v.72M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  )
}
