interface Props {
  title: string
  onGoHome: () => void
}

export function SessionCompleted({ title, onGoHome }: Props) {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center text-center">
      {/* Checkmark icon */}
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#c8f135]/15 ring-1 ring-[#c8f135]/30">
        <svg
          className="h-10 w-10 text-[#c8f135]"
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

      <h1 className="mt-6 text-2xl font-bold text-white">Session complete!</h1>
      <p className="mt-2 text-base font-medium text-slate-300">{title}</p>
      <p className="mt-1 text-sm text-slate-500">
        Great work. Your logs have been saved.
      </p>

      <button
        type="button"
        onClick={onGoHome}
        className="mt-10 inline-flex items-center rounded-lg bg-[#c8f135] px-6 py-3 text-sm font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135] focus-visible:ring-offset-2"
      >
        Back to home
      </button>
    </div>
  )
}
