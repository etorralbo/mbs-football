type BadgeVariant =
  | 'pending'
  | 'completed'
  | 'overdue'
  | 'in_progress'
  | 'draft'
  | 'published'
  | 'incomplete'
  | 'done'
  | 'info'
  | 'default'

interface BadgeProps {
  variant?: BadgeVariant
  dot?: boolean
  children: React.ReactNode
}

const variantClasses: Record<BadgeVariant, string> = {
  pending:     'bg-amber-500/10 text-amber-400 ring-amber-400/20',
  completed:   'bg-emerald-500/10 text-emerald-400 ring-emerald-400/20',
  overdue:     'bg-red-500/10 text-red-400 ring-red-400/20',
  in_progress: 'bg-blue-500/10 text-blue-400 ring-blue-400/20',
  draft:       'bg-slate-500/10 text-slate-400 ring-slate-400/20',
  published:   'bg-emerald-500/10 text-emerald-400 ring-emerald-400/20',
  incomplete:  'bg-amber-500/10 text-amber-300 ring-amber-400/20',
  done:        'bg-[#c8f135]/10 text-[#c8f135] ring-[#c8f135]/20',
  info:        'bg-[#4f9cf9]/10 text-[#4f9cf9] ring-[#4f9cf9]/20',
  default:     'bg-white/5 text-slate-400 ring-white/10',
}

const dotColors: Record<BadgeVariant, string> = {
  pending:     'bg-amber-400',
  completed:   'bg-emerald-400',
  overdue:     'bg-red-400',
  in_progress: 'bg-blue-400',
  draft:       'bg-slate-500',
  published:   'bg-emerald-400',
  incomplete:  'bg-amber-400',
  done:        'bg-[#c8f135]',
  info:        'bg-[#4f9cf9]',
  default:     'bg-slate-400',
}

export function Badge({ variant = 'default', dot, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${variantClasses[variant]}`}
    >
      {dot && (
        <span className={`h-1.5 w-1.5 rounded-full ${dotColors[variant]}`} aria-hidden="true" />
      )}
      {children}
    </span>
  )
}
