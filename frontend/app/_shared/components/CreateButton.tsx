import Link from 'next/link'

interface CreateButtonProps {
  children: React.ReactNode
  href?: string
  onClick?: () => void
  icon?: boolean
  className?: string
  disabled?: boolean
}

const plusIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-3.5 w-3.5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
)

const baseClasses =
  'inline-flex items-center gap-1.5 rounded-md bg-[#c8f135] px-3 py-1.5 text-xs font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755]'

export function CreateButton({
  children,
  href,
  onClick,
  icon = true,
  className = '',
  disabled,
}: CreateButtonProps) {
  const classes = `${baseClasses} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`.trim()

  if (href) {
    return (
      <Link href={href} className={classes}>
        {icon && plusIcon}
        {children}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={classes}>
      {icon && plusIcon}
      {children}
    </button>
  )
}
