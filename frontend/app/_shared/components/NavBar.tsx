'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/app/_shared/auth/supabaseClient'

export function NavBar() {
  const pathname = usePathname()
  const router = useRouter()

  function isActive(href: string) {
    return pathname.startsWith(href)
  }

  function handleSignOut() {
    supabase.auth.signOut().then(() => router.replace('/login'))
  }

  return (
    <nav className="flex h-14 items-center gap-1 border-b border-zinc-200 bg-white px-6">
      <span className="mr-4 text-sm font-semibold text-zinc-900">Mettle Performance</span>
      <NavLink href="/templates" active={isActive('/templates')}>
        Templates
      </NavLink>
      <NavLink href="/sessions" active={isActive('/sessions')}>
        Sessions
      </NavLink>
      <div className="ml-auto">
        <button
          onClick={handleSignOut}
          className="rounded-md px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
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
      className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'bg-zinc-100 font-medium text-zinc-900'
          : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
      }`}
    >
      {children}
    </Link>
  )
}
