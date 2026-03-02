import Link from 'next/link'

interface Action {
  label: string
  href?: string
  onClick?: () => void
}

interface Props {
  title: string
  description?: string
  action?: Action
}

function ActionEl({ action }: { action: Action }) {
  const cls =
    'mt-4 inline-flex items-center rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50'

  if (action.href) {
    return (
      <Link href={action.href} className={cls}>
        {action.label}
      </Link>
    )
  }
  return (
    <button type="button" onClick={action.onClick} className={cls}>
      {action.label}
    </button>
  )
}

export function AthleteEmpty({ title, description, action }: Props) {
  return (
    <div className="mt-12 flex flex-col items-center text-center">
      {/* Dumbbell icon */}
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100">
        <svg
          className="h-7 w-7 text-zinc-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 12h2m14 0h2M5 12a7 7 0 1114 0A7 7 0 015 12zm4-2v4m6-4v4"
          />
        </svg>
      </div>

      <p className="mt-4 text-sm font-semibold text-zinc-900">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-sm text-zinc-500">{description}</p>
      )}
      {action && <ActionEl action={action} />}
    </div>
  )
}
