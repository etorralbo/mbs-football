'use client'

import type { SetDraft } from '@/src/features/session-execution/draftState'

interface Props {
  setNumber: number    // 1-based label
  draft: SetDraft
  disabled?: boolean   // when session is completed
  onChange: (field: 'reps' | 'weight' | 'rpe', value: string) => void
}

const inputCls =
  'w-20 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 ' +
  'placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ' +
  'disabled:bg-zinc-50 disabled:text-zinc-400'

export function SetRow({ setNumber, draft, disabled, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 text-sm text-zinc-400">{setNumber}</span>

      <input
        type="number"
        value={draft.reps}
        onChange={(e) => onChange('reps', e.target.value)}
        placeholder="Reps"
        min={0}
        disabled={disabled || draft.done}
        className={inputCls}
        aria-label={`Set ${setNumber} reps`}
      />
      <input
        type="number"
        value={draft.weight}
        onChange={(e) => onChange('weight', e.target.value)}
        placeholder="kg"
        min={0}
        step={0.5}
        disabled={disabled || draft.done}
        className={inputCls}
        aria-label={`Set ${setNumber} weight`}
      />
      <input
        type="number"
        value={draft.rpe}
        onChange={(e) => onChange('rpe', e.target.value)}
        placeholder="RPE"
        min={1}
        max={10}
        step={0.5}
        disabled={disabled || draft.done}
        className={inputCls}
        aria-label={`Set ${setNumber} rpe`}
      />

      {draft.done && (
        <span
          className="text-xs font-medium text-emerald-600"
          aria-label={`Set ${setNumber} done`}
        >
          ✓
        </span>
      )}
    </div>
  )
}
