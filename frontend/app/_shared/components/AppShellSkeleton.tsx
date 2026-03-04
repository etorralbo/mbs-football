'use client'

/**
 * Full-page skeleton that replaces the real app shell (NavBar + content)
 * during the bootstrap phase (session resolution, /v1/me fetch, onboarding).
 *
 * Does not depend on role, team, or any async data.
 */
export function AppShellSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className="flex h-screen overflow-hidden bg-[#0d141c]"
      data-testid="app-shell-skeleton"
    >
      {/* ── Sidebar skeleton ──────────────────────────────────────────── */}
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-slate-800 bg-[#0b1117]">
        {/* Logo */}
        <div className="flex items-center gap-3 p-6">
          <div className="h-9 w-9 rounded-lg bg-slate-800 animate-pulse" />
          <div className="space-y-1.5">
            <div className="h-3 w-24 rounded bg-slate-800 animate-pulse" />
            <div className="h-2 w-16 rounded bg-slate-800 animate-pulse" />
          </div>
        </div>

        {/* Nav items (6 rows) */}
        <div className="space-y-1 px-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
              <div className="h-5 w-5 rounded bg-slate-800 animate-pulse" />
              <div
                className="h-3 rounded bg-slate-800 animate-pulse"
                style={{ width: `${60 + (i % 3) * 16}px` }}
              />
            </div>
          ))}
        </div>
      </aside>

      {/* ── Content skeleton ──────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-8">
        {/* Header */}
        <div className="h-6 w-48 rounded bg-slate-800 animate-pulse" />
        <div className="mt-2 h-4 w-72 rounded bg-slate-800 animate-pulse" />

        {children}
      </main>
    </div>
  )
}
