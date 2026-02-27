'use client'

import Link from 'next/link'
import { Skeleton } from '@/app/_shared/components/Skeleton'
import { useActivationState } from '../useActivationState'
import { ActivationChecklist } from './ActivationChecklist'

export function ActivationBanner() {
  const { isLoading, error, role, steps, nextAction } = useActivationState()

  if (isLoading) {
    return (
      <div
        aria-label="Loading setup progress"
        className="rounded-lg border border-zinc-200 bg-white p-4"
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
        className="rounded-lg border border-green-200 bg-green-50 p-4"
      >
        <p className="text-sm font-medium text-green-800">✅ Setup complete</p>
      </div>
    )
  }

  return (
    <div
      aria-label="Setup progress"
      className="rounded-lg border border-indigo-100 bg-indigo-50 p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">Setup progress</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {completedCount} / {steps.length} steps completed
          </p>
          <ActivationChecklist steps={steps} />
        </div>
        <Link
          data-testid="activation-cta"
          href={nextAction.href}
          className="inline-flex shrink-0 items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
        >
          {nextAction.label}
        </Link>
      </div>
    </div>
  )
}
