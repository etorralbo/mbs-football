interface EmptyStateProps {
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="mt-12 flex flex-col items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
        <svg
          className="h-5 w-5 text-zinc-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      </div>
      <p className="mt-3 text-sm font-medium text-zinc-900">{title}</p>
      {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
