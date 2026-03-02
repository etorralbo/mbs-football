import Link from 'next/link'

interface Action {
  label: string
  href?: string
  onClick?: () => void
}

interface EmptyStateProps {
  title: string
  description?: string
  primaryAction?: Action
  secondaryAction?: Action
}

function ActionLink({ action, className }: { action: Action; className: string }) {
  if (!action.href && !action.onClick) return null
  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    )
  }
  return (
    <button onClick={action.onClick} className={className}>
      {action.label}
    </button>
  )
}

export function EmptyState({
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="mt-12 flex flex-col items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/8">
        <svg
          className="h-5 w-5 text-slate-400"
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
      <p className="mt-3 text-sm font-medium text-white">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      {primaryAction && (
        <ActionLink
          action={primaryAction}
          className="mt-4 text-sm font-medium text-[#4f9cf9] hover:text-[#7ab5fb]"
        />
      )}
      {secondaryAction && (
        <ActionLink
          action={secondaryAction}
          className="mt-2 text-sm text-slate-500 hover:text-slate-300"
        />
      )}
    </div>
  )
}
