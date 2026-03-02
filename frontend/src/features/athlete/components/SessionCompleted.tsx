interface Props {
  title: string
  onGoHome: () => void
}

export function SessionCompleted({ title, onGoHome }: Props) {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center text-center">
      {/* Checkmark icon */}
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
        <svg
          className="h-10 w-10 text-emerald-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <h1 className="mt-6 text-2xl font-bold text-zinc-900">Session complete!</h1>
      <p className="mt-2 text-base font-medium text-zinc-700">{title}</p>
      <p className="mt-1 text-sm text-zinc-400">
        Great work. Your logs have been saved.
      </p>

      <button
        type="button"
        onClick={onGoHome}
        className="mt-10 inline-flex items-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
      >
        Back to home
      </button>
    </div>
  )
}
