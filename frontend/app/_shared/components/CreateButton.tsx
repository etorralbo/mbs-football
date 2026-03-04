import Link from 'next/link'

interface CreateButtonProps {
  children: React.ReactNode
  href?: string
  onClick?: () => void
  className?: string
  disabled?: boolean
}

const baseClasses =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 bg-[#c8f135] text-[#0a0d14] hover:bg-[#d4f755] focus-visible:ring-[#c8f135] disabled:bg-[#c8f135]/40 disabled:text-[#0a0d14]/40 px-4 py-2 text-sm'

export function CreateButton({
  children,
  href,
  onClick,
  className = '',
  disabled,
}: CreateButtonProps) {
  const classes = `${baseClasses} ${className}`.trim()

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  )
}
