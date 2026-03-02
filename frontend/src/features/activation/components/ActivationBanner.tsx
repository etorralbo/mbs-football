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
        className="rounded-lg border border-white/8 bg-[#131922] p-3"
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
        className="rounded-lg border border-[#c8f135]/20 bg-[#c8f135]/8 px-4 py-2"
      >
        <p className="text-sm font-medium text-[#c8f135]">✅ Setup complete</p>
      </div>
    )
  }

  return (
    <div
      aria-label="Setup progress"
      className="rounded-lg border border-[#4f9cf9]/20 bg-[#4f9cf9]/8 px-4 py-2.5"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-medium text-slate-300">
          🚀 Setup progress · {completedCount} / {steps.length} completed
        </p>
        <Link
          data-testid="activation-cta"
          href={nextAction.href}
          className="inline-flex shrink-0 items-center rounded-md bg-[#4f9cf9] px-3 py-1 text-xs font-bold text-[#0a0d14] transition-colors hover:bg-[#7ab5fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9cf9] focus-visible:ring-offset-2"
        >
          {nextAction.label}
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {steps.map((step) =>
          step.completed ? (
            <span
              key={step.key}
              className="inline-flex items-center rounded-full bg-[#c8f135]/15 px-2.5 py-0.5 text-xs font-medium text-[#c8f135]"
            >
              ✓ {step.label}
            </span>
          ) : step.key === nextAction.key ? (
            <Link
              key={step.key}
              href={step.href}
              className="inline-flex items-center rounded-full bg-white/8 px-2.5 py-0.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-1"
            >
              ○ {step.label}
            </Link>
          ) : (
            <span
              key={step.key}
              className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-medium text-slate-500"
            >
              ○ {step.label}
            </span>
          )
        )}
      </div>
    </div>
  )
}
