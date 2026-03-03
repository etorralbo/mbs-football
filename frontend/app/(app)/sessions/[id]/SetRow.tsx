'use client'

import type { SetDraft } from '@/src/features/session-execution/draftState'

interface Props {
  setNumber: number    // 1-based label
  draft: SetDraft
  disabled?: boolean   // when session is completed
  completionEnabled?: boolean
  saving?: boolean
  onToggleDone?: () => void
  onChange: (field: 'reps' | 'weight' | 'rpe', value: string) => void
}

const inputCls =
  'w-20 rounded-md border border-white/10 bg-[#0d1420] px-2 py-1.5 text-sm text-white ' +
  'placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none focus:ring-1 focus:ring-[#4f9cf9] ' +
  'disabled:opacity-40'

export function SetRow({ setNumber, draft, disabled, completionEnabled, saving, onToggleDone, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 text-sm text-slate-500">{setNumber}</span>

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

      {/* Per-set done toggle — athletes only */}
      {completionEnabled && !disabled ? (
        <button
          type="button"
          onClick={onToggleDone}
          disabled={saving}
          aria-label={draft.done ? `Undo set ${setNumber}` : `Mark set ${setNumber} done`}
          className="flex-shrink-0 rounded-full p-0.5 transition-colors disabled:opacity-40"
        >
          {draft.done ? (
            /* Filled green check circle */
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#c8f135]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
            </svg>
          ) : (
            /* Outline grey circle */
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <circle cx="12" cy="12" r="9.25" />
            </svg>
          )}
        </button>
      ) : (
        /* Read-only indicator for coach / completed session */
        draft.done && (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#c8f135]" viewBox="0 0 24 24" fill="currentColor" aria-label={`Set ${setNumber} done`}>
            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
          </svg>
        )
      )}
    </div>
  )
}
