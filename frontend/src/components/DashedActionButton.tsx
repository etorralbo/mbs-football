import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Dashed-border action button used for creation CTAs in the workout builder.
 *
 * Three sizes map to the visual hierarchy:
 *   - sm  → "Add set" (within an exercise card)
 *   - md  → "Add exercise" (within a block)
 *   - lg  → "Add new block" (full-width, page-level)
 */

const plusIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
)

type Size = 'sm' | 'md' | 'lg'

const sizeStyles: Record<Size, string> = {
  sm: 'gap-1 rounded-md border px-2.5 py-1.5 text-xs [&_svg]:h-3 [&_svg]:w-3',
  md: 'gap-2 rounded-lg border px-4 py-2.5 text-sm [&_svg]:h-4 [&_svg]:w-4',
  lg: 'gap-2 rounded-2xl border-2 justify-center w-full py-4 text-sm font-medium [&_svg]:h-5 [&_svg]:w-5',
}

const base =
  'inline-flex cursor-pointer items-center border-dashed text-slate-400 transition-all duration-150 ease-out ' +
  'hover:border-[#c8f135] hover:text-[#c8f135] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1420] ' +
  'active:scale-[0.97] ' +
  'disabled:pointer-events-none disabled:opacity-40'

const idleBorder: Record<Size, string> = {
  sm: 'border-slate-700/60',
  md: 'border-slate-700',
  lg: 'border-slate-800',
}

interface DashedActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size
  children: ReactNode
}

export function DashedActionButton({
  size = 'md',
  className,
  children,
  ...rest
}: DashedActionButtonProps) {
  return (
    <button
      type="button"
      className={`${base} ${sizeStyles[size]} ${idleBorder[size]}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {plusIcon}
      {children}
    </button>
  )
}
