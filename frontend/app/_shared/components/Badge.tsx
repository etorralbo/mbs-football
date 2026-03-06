type BadgeVariant = 'pending' | 'completed' | 'overdue' | 'in_progress' | 'default'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
}

const variantClasses: Record<BadgeVariant, string> = {
  pending: 'bg-amber-900/30 text-amber-400 ring-1 ring-inset ring-amber-800/50',
  completed: 'bg-emerald-900/30 text-emerald-400 ring-1 ring-inset ring-emerald-800/50',
  overdue: 'bg-red-900/30 text-red-400 ring-1 ring-inset ring-red-800/50',
  in_progress: 'bg-blue-900/30 text-blue-400 ring-1 ring-inset ring-blue-800/50',
  default: 'bg-white/8 text-slate-400 ring-1 ring-inset ring-white/10',
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
