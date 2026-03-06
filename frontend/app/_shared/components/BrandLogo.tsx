import Image from 'next/image'

type Variant = 'icon' | 'full' | 'sidebar'

interface BrandLogoProps {
  variant?: Variant
  className?: string
}

/**
 * Centralized branding component.
 *
 * Variants:
 *  - icon:    Logo mark only (compact spaces)
 *  - full:    Logo mark + "Mettle Performance" text (public/auth screens)
 *  - sidebar: Logo mark + stacked text with subtitle (app sidebar)
 */
export function BrandLogo({ variant = 'full', className = '' }: BrandLogoProps) {
  if (variant === 'icon') {
    return (
      <Image
        src="/branding/mettle-log-icon.png"
        alt="Mettle Performance"
        width={36}
        height={36}
        className={`rounded-lg ${className}`}
        priority
      />
    )
  }

  if (variant === 'sidebar') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <Image
          src="/branding/mettle-log-icon.png"
          alt=""
          width={36}
          height={36}
          className="rounded-lg"
          priority
        />
        <div>
          <span className="text-sm font-bold leading-tight text-white">Mettle Performance</span>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Elite Coach Pro</p>
        </div>
      </div>
    )
  }

  // variant === 'full'
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src="/branding/mettle-log-full.png"
        alt=""
        width={32}
        height={32}
        className="rounded-lg"
        priority
      />
      <span className="text-lg font-bold text-white">Mettle Performance</span>
    </div>
  )
}
