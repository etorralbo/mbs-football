'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { TodaySessionCard } from '@/src/features/athlete/components/TodaySessionCard'
import { AthleteLoading } from '@/src/features/athlete/components/AthleteLoading'
import { AthleteEmpty } from '@/src/features/athlete/components/AthleteEmpty'
import { AthleteError } from '@/src/features/athlete/components/AthleteError'
import { getAthleteSessionList } from '@/src/features/athlete/api'
import { normalizeAthleteError } from '@/src/features/athlete/errors'
import { ProgressSection } from '@/src/features/athlete/components/ProgressSection'
import type { WorkoutSessionSummary } from '@/app/_shared/api/types'

type LoadState = 'loading' | 'error' | 'success'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function AthleteHomePage() {
  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [canRetry, setCanRetry] = useState(true)
  // Incrementing this value re-runs the fetch effect (retry mechanism)
  const [retryKey, setRetryKey] = useState(0)

  const router = useRouter()
  // "Latest ref" pattern: keeps a current router reference inside effects
  // without adding router to the dep-array (which could cause spurious re-fetches
  // if Next.js ever changes its router identity between renders).
  const routerRef = useRef(router)
  routerRef.current = router

  useEffect(() => {
    document.title = "Today's Workout | Mettle Performance"
  }, [])

  useEffect(() => {
    const ac = new AbortController()

    setLoadState('loading')
    setErrorMessage(null)
    setCanRetry(true)
    // Note: sessions are intentionally NOT cleared here.
    // The stale list is hidden by the loadState conditions below, so there is
    // no visual flash. Preserving it means a future background-refresh feature
    // can show content while re-fetching without any architectural change.

    getAthleteSessionList(ac.signal)
      .then((data) => {
        setSessions(data)
        setLoadState('success')
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return
        try {
          handleApiError(err, routerRef.current)
        } catch (e: unknown) {
          const { message, forbidden, notFound } = normalizeAthleteError(e)
          setErrorMessage(message)
          setCanRetry(!forbidden && !notFound)
          setLoadState('error')
        }
      })

    return () => ac.abort()
  }, [retryKey]) // router intentionally excluded — stable ref, routerRef handles it

  const handleRetry = useCallback(() => setRetryKey((k) => k + 1), [])

  const pendingSession = sessions.find((s) => !s.completed_at) ?? null
  const recentCompleted = sessions.filter((s) => s.completed_at).slice(0, 5)

  return (
    <>
      <h1 className="text-xl font-semibold text-white">Today's Workout</h1>

      {/*
        aria-live="polite": screen readers announce content changes when
        the region updates (loading → error / success).
        aria-busy signals that the region is still loading.
      */}
      <section
        aria-live="polite"
        aria-busy={loadState === 'loading'}
        aria-label="Today's session"
      >
        {/* ── Loading */}
        {loadState === 'loading' && <AthleteLoading variant="home" />}

        {/* ── Error */}
        {loadState === 'error' && (
          <AthleteError
            message={
              errorMessage ??
              "We couldn't load your sessions. Check your connection and try again."
            }
            onRetry={canRetry ? handleRetry : undefined}
            onBack={() => routerRef.current.push('/sessions')}
            backLabel="Back to sessions"
          />
        )}

        {/* ── Success: no sessions assigned at all */}
        {loadState === 'success' && sessions.length === 0 && (
          <AthleteEmpty
            title="No sessions assigned today"
            description="Your coach hasn't assigned any session for today. Check back later."
          />
        )}

        {/* ── Success: all pending done, nothing left */}
        {loadState === 'success' && sessions.length > 0 && !pendingSession && (
          <div className="mt-6 rounded-xl border border-[#c8f135]/20 bg-[#c8f135]/8 p-5 text-center">
            <p className="text-sm font-semibold text-[#c8f135]">
              All sessions done for today. Great work!
            </p>
          </div>
        )}

        {/* ── Success: there is a pending session */}
        {loadState === 'success' && pendingSession && (
          <div className="mt-6">
            <TodaySessionCard session={pendingSession} />
          </div>
        )}

        {/* ── Recent completed sessions */}
        {loadState === 'success' && recentCompleted.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Recent
            </h2>
            <ul className="mt-3 space-y-2">
              {recentCompleted.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/athlete/session/${s.id}`}
                    className="flex items-center justify-between rounded-lg border border-white/8 bg-[#131922] px-4 py-3 transition-colors hover:bg-white/5"
                  >
                    <span className="text-sm text-slate-200">
                      {s.template_title}
                      {s.scheduled_for && (
                        <span className="ml-2 text-slate-500">
                          · {formatDate(s.scheduled_for)}
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-semibold text-emerald-400">
                      Completed
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {loadState === 'success' && <ProgressSection />}
    </>
  )
}
