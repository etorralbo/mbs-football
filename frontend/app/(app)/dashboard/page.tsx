'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { useActivationState } from '@/src/features/activation/useActivationState'
import { OnboardingBanner } from '@/src/features/activation/OnboardingBanner'
import type { AttentionItem, AttentionQueueData } from '@/app/_shared/api/types'

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ label, count, accent }: { label: string; count: number; accent: string }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{label}</h2>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${accent}`}>{count}</span>
    </div>
  )
}

function EmptySection({ message }: { message: string }) {
  return (
    <p className="mt-3 text-sm text-slate-500">{message}</p>
  )
}

function SessionRow({ item, href }: { item: AttentionItem; href: string }) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-white/8 bg-[#131922] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{item.template_title}</p>
        <p className="mt-0.5 text-xs text-slate-400">
          {item.athlete_name}
          {item.scheduled_for && ` · ${formatDate(item.scheduled_for)}`}
        </p>
      </div>
      <Link
        href={href}
        className="ml-4 shrink-0 text-xs text-slate-400 hover:text-white"
      >
        View →
      </Link>
    </li>
  )
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center rounded-lg border border-white/8 bg-[#131922] px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:border-white/15 hover:bg-white/5 hover:text-white"
    >
      {label}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [queue, setQueue] = useState<AttentionQueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { role, isLoading: activationLoading, steps, nextAction } = useActivationState()

  useEffect(() => {
    if (!activationLoading && role && role !== 'COACH') {
      router.replace('/sessions')
    }
  }, [activationLoading, role, router])

  useEffect(() => {
    document.title = 'Dashboard | Mettle Performance'
  }, [])

  useEffect(() => {
    request<AttentionQueueData>('/v1/dashboard/attention')
      .then(setQueue)
      .catch((err: unknown) => {
        try {
          handleApiError(err, router)
        } catch {
          setError('Failed to load dashboard data. Please try again.')
        }
      })
      .finally(() => setLoading(false))
  }, [router])

  if (activationLoading || (role && role !== 'COACH')) {
    return null
  }

  const hasNothing =
    queue &&
    queue.overdue.length === 0 &&
    queue.due_today.length === 0 &&
    queue.stale.length === 0

  return (
    <>
      <h1 className="text-xl font-semibold text-white">Dashboard</h1>

      {/* Onboarding guide — only visible while steps are incomplete */}
      {!activationLoading && steps.length > 0 && nextAction && (
        <div className="mt-4">
          <OnboardingBanner steps={steps} nextAction={nextAction} />
        </div>
      )}

      {loading && (
        <div className="mt-6">
          <span className="sr-only">Loading…</span>
          <SkeletonList rows={3} />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-6 text-sm text-red-400">
          {error}
        </p>
      )}

      {!loading && !error && queue && (
        <>
          {/* ---------------------------------------------------------------- */}
          {/* Attention queue                                                   */}
          {/* ---------------------------------------------------------------- */}
          {hasNothing && (
            <div className="mt-8 rounded-lg border border-white/8 bg-[#131922] p-6 text-center">
              <p className="text-sm font-medium text-emerald-400">Nothing needs attention right now</p>
              <p className="mt-1 text-xs text-slate-500">All sessions are on track.</p>
            </div>
          )}

          {/* Overdue */}
          <section className="mt-8" aria-label="Overdue sessions">
            <SectionHeader
              label="Overdue"
              count={queue.overdue.length}
              accent="bg-red-900/40 text-red-400"
            />
            {queue.overdue.length === 0 ? (
              <EmptySection message="No overdue sessions" />
            ) : (
              <ul className="mt-3 space-y-2">
                {queue.overdue.map((item) => (
                  <SessionRow key={item.id} item={item} href={`/sessions/${item.id}`} />
                ))}
              </ul>
            )}
          </section>

          {/* Due today */}
          <section className="mt-6" aria-label="Due today">
            <SectionHeader
              label="Due today"
              count={queue.due_today.length}
              accent="bg-amber-900/40 text-amber-400"
            />
            {queue.due_today.length === 0 ? (
              <EmptySection message="Nothing due today" />
            ) : (
              <ul className="mt-3 space-y-2">
                {queue.due_today.map((item) => (
                  <SessionRow key={item.id} item={item} href={`/sessions/${item.id}`} />
                ))}
              </ul>
            )}
          </section>

          {/* Stale in-progress */}
          <section className="mt-6" aria-label="Stale in-progress sessions">
            <SectionHeader
              label="Stale — no activity for 48 h"
              count={queue.stale.length}
              accent="bg-slate-800 text-slate-400"
            />
            {queue.stale.length === 0 ? (
              <EmptySection message="No stale sessions" />
            ) : (
              <ul className="mt-3 space-y-2">
                {queue.stale.map((item) => (
                  <SessionRow key={item.id} item={item} href={`/sessions/${item.id}`} />
                ))}
              </ul>
            )}
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Compact summary                                                   */}
          {/* ---------------------------------------------------------------- */}
          <section className="mt-8" aria-label="Summary">
            <div className="grid grid-cols-3 gap-3">
              <SummaryCard
                testId="summary-overdue"
                label="Overdue"
                value={queue.summary.total_overdue}
                accent="text-red-400"
              />
              <SummaryCard
                testId="summary-due-today"
                label="Due today"
                value={queue.summary.total_due_today}
                accent="text-amber-400"
              />
              <SummaryCard
                testId="summary-stale"
                label="Stale"
                value={queue.summary.total_stale}
                accent="text-slate-400"
              />
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Quick actions                                                      */}
          {/* ---------------------------------------------------------------- */}
          <section className="mt-8" aria-label="Quick actions">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Quick Actions
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <QuickAction href="/templates" label="New template" />
              <QuickAction href="/sessions" label="View sessions" />
              <QuickAction href="/exercises" label="New exercise" />
              <QuickAction href="/team" label="Manage team" />
            </div>
          </section>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function SummaryCard({
  testId,
  label,
  value,
  accent,
}: {
  testId: string
  label: string
  value: number
  accent: string
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-white/8 bg-[#131922] p-4"
    >
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
    </div>
  )
}
