import type { ReactNode } from 'react'

interface Props {
  name: string
  children: ReactNode
}

export function BlockSection({ name, children }: Props) {
  return (
    <section aria-label={name}>
      <h2 className="border-l-2 border-[#c8f135] pl-3 text-sm font-semibold uppercase tracking-wide text-white">
        {name}
      </h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  )
}
