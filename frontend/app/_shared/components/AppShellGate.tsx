'use client'

/**
 * Conditionally renders the real app shell (NavBar + content) or a skeleton
 * placeholder while the app is bootstrapping (session + /v1/me + onboarding).
 *
 * During bootstrap on /onboarding, children are mounted hidden (display:none)
 * so the router guard effects can still execute and redirect.
 */

import { usePathname } from 'next/navigation'
import { useAuth } from '@/src/shared/auth/AuthContext'
import { NavBar } from '@/app/_shared/components/NavBar'
import { MobileNav } from '@/app/_shared/components/MobileNav'
import { TeamPageContent } from '@/app/_shared/components/TeamPageContent'
import { AppShellSkeleton } from '@/app/_shared/components/AppShellSkeleton'

export function AppShellGate({ children }: { children: React.ReactNode }) {
  const { loading, isAppBootstrapping } = useAuth()
  const pathname = usePathname()

  // /onboarding always shows skeleton — it's a pure router guard that redirects.
  const onBootstrapRoute = pathname === '/onboarding'
  const showSkeleton = isAppBootstrapping || onBootstrapRoute

  if (showSkeleton) {
    return (
      <AppShellSkeleton>
        {/* After /v1/me resolves, mount children hidden so router-guard
            effects (OnboardingHub) can execute and trigger redirects. */}
        {!loading && (
          <div className="hidden" aria-hidden="true">
            {children}
          </div>
        )}
      </AppShellSkeleton>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0d141c] md:flex-row">
      {/* Desktop sidebar */}
      <div className="hidden w-64 flex-shrink-0 md:flex">
        <NavBar />
      </div>

      {/* Mobile top bar + drawer */}
      <MobileNav />

      <main className="flex-1 overflow-y-auto">
        <TeamPageContent>{children}</TeamPageContent>
      </main>
    </div>
  )
}
