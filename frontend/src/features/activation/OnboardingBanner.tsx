'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ActivationStep } from './activationRules'

interface OnboardingBannerProps {
  steps: ActivationStep[]
  nextAction: ActivationStep | null
}

export function OnboardingBanner({ steps, nextAction }: OnboardingBannerProps) {
  // Dismiss hides the banner for the current render only (in-memory).
  // On the next mount (page navigation) the banner reappears if still incomplete.
  // When nextAction becomes null (all steps done) the caller stops rendering this.
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || !nextAction) return null

  const completedCount = steps.filter((s) => s.completed).length
  const totalCount = steps.length

  function dismiss() {
    setDismissed(true)
  }

  return (
    <div
      role="region"
      aria-label="Getting started"
      className="mb-6 rounded-xl border border-[#c8f135]/20 bg-[#c8f135]/5 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#c8f135]">
              Get started
            </span>
            <span className="text-xs text-slate-500">
              {completedCount} / {totalCount} complete
            </span>
          </div>

          {/* Step list */}
          <ol className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {steps.map((step, i) => (
              <li key={step.key} className="flex items-center gap-1.5 text-sm">
                {step.completed ? (
                  <svg
                    className="h-4 w-4 shrink-0 text-[#c8f135]"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[10px] font-bold text-slate-400">
                    {i + 1}
                  </span>
                )}
                <span className={step.completed ? 'text-slate-500 line-through' : 'text-slate-300'}>
                  {step.label}
                </span>
              </li>
            ))}
          </ol>

          {/* Next action CTA */}
          <div className="mt-4">
            <Link
              href={nextAction.href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#c8f135] px-4 py-2 text-sm font-bold text-[#0a0d14] transition-all hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135]/50"
            >
              {nextAction.label}
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss getting started guide"
          className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-white/8 hover:text-slate-300"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
