// Stable ID for the description paragraph — safe because only one AthleteError
// is ever rendered at a time (it replaces the whole page content).
const DESC_ID = 'athlete-error-desc'

interface Props {
  message?: string
  onRetry?: () => void
  onBack?: () => void
  backLabel?: string
}

export function AthleteError({
  message = 'Something went wrong. Please try again.',
  onRetry,
  onBack,
  backLabel = 'Back to home',
}: Props) {
  return (
    <div
      role="alert"
      aria-describedby={DESC_ID}
      className="mt-12 flex flex-col items-center text-center"
    >
      {/* Warning icon */}
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-900/30">
        <svg
          className="h-7 w-7 text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      </div>

      <p className="mt-4 text-sm font-semibold text-white">
        Something went wrong
      </p>
      {/* aria-describedby target: gives screen readers the detailed message */}
      <p id={DESC_ID} className="mt-1 max-w-xs text-sm text-slate-400">
        {message}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#c8f135] px-4 py-2 text-sm font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0d14]"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Try again
          </button>
        )}

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center rounded-lg border border-white/10 bg-white/8 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2"
          >
            {backLabel}
          </button>
        )}
      </div>
    </div>
  )
}
