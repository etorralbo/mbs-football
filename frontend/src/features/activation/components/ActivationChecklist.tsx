import Link from 'next/link'
import type { ActivationStep } from '../activationRules'

interface Props {
  steps: ActivationStep[]
}

export function ActivationChecklist({ steps }: Props) {
  return (
    <ul className="mt-3 space-y-1.5">
      {steps.map((step) => (
        <li key={step.key} className="flex items-center gap-2">
          <span aria-hidden="true" className="text-sm">
            {step.completed ? '✅' : '⏳'}
          </span>
          {step.completed ? (
            <span className="text-xs text-zinc-400 line-through">{step.label}</span>
          ) : (
            <Link
              href={step.href}
              className="text-xs text-zinc-700 hover:text-indigo-600 hover:underline"
            >
              {step.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}
