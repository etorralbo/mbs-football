'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavBar() {
  const pathname = usePathname()

  function isActive(href: string) {
    return pathname.startsWith(href)
  }

  return (
    <nav className="flex h-14 items-center gap-1 border-b border-zinc-200 bg-white px-6">
      <span className="mr-4 text-sm font-semibold text-zinc-900">MBS Football</span>
      <NavLink href="/templates" active={isActive('/templates')}>
        Templates
      </NavLink>
      <NavLink href="/sessions" active={isActive('/sessions')}>
        Sessions
      </NavLink>
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
