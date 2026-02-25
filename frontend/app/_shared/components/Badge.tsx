type BadgeVariant = 'pending' | 'completed' | 'default'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
}

const variantClasses: Record<BadgeVariant, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  default: 'bg-zinc-100 text-zinc-600 ring-1 ring-inset ring-zinc-200',
}

export function Badge({ variant = 'default', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]}`}
    >
      {children}
    </span>
  )
}
