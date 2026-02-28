'use client'

import Link from 'next/link'
import { Skeleton } from '@/app/_shared/components/Skeleton'
import { useActivationState } from '../useActivationState'

export function ActivationBanner() {
  const { isLoading, error, role, steps, nextAction } = useActivationState()

  if (isLoading) {
    return (
      <div
        aria-label="Loading setup progress"
        className="rounded-lg border border-zinc-200 bg-white p-3"
      >
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="mt-2 h-3 w-1/3" />
      </div>
    )
  }

  // On error or pre-onboarding (no role yet): hide silently.
  if (error || !role) return null

  const completedCount = steps.filter((s) => s.completed).length

  if (nextAction === null) {
    return (
      <div
        role="status"
        aria-label="Setup complete"
        className="rounded-lg border border-green-200 bg-green-50 px-4 py-2"
      >
        <p className="text-sm font-medium text-green-800">✅ Setup complete</p>
      </div>
    )
  }

  return (
    <div
      aria-label="Setup progress"
      className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-2.5"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-medium text-zinc-600">
          🚀 Setup progress · {completedCount} / {steps.length} completed
        </p>
        <Link
          data-testid="activation-cta"
          href={nextAction.href}
          className="inline-flex shrink-0 items-center rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
        >
          {nextAction.label}
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {steps.map((step) =>
          step.completed ? (
            <span
              key={step.key}
              className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700"
            >
              ✓ {step.label}
            </span>
          ) : step.key === nextAction.key ? (
            <Link
              key={step.key}
              href={step.href}
              className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1"
            >
              ○ {step.label}
            </Link>
          ) : (
            <span
              key={step.key}
              className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-400"
            >
              ○ {step.label}
            </span>
          )
        )}
      </div>
    </div>
  )
}
