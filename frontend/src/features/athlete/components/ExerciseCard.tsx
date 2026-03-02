import type { ExecutionItem } from '@/app/_shared/api/types'
import type {
  AthleteAction,
  AthleteDraft,
  AthleteSetDraft,
  SetStatusMap,
} from '@/src/features/athlete/athleteStore'
import { SetTableEditor } from './SetTableEditor'

interface Props {
  item: ExecutionItem
  exerciseSets: AthleteDraft[string]
  exerciseIndex: number
  dispatch: (action: AthleteAction) => void
  setStatuses: SetStatusMap
  onSaveSet: (exerciseId: string, setNumber: number) => void
}

function prescriptionText(p: Record<string, unknown>): string {
  const parts: string[] = []
  if (p.sets) parts.push(`${p.sets} sets`)
  if (p.reps) parts.push(`${p.reps} reps`)
  if (p.load) parts.push(`@ ${p.load}`)
  if (p.duration) parts.push(String(p.duration))
  if (p.rest) parts.push(`rest ${p.rest}`)
  return parts.join(' · ') || '—'
}

export function ExerciseCard({
  item,
  exerciseSets,
  exerciseIndex,
  dispatch,
  setStatuses,
  onSaveSet,
}: Props) {
  const sortedSets = Object.entries(exerciseSets)
    .map(([k, v]) => ({ setNumber: Number(k), draft: v as AthleteSetDraft }))
    .sort((a, b) => a.setNumber - b.setNumber)

  return (
    <div className="rounded-xl border border-white/8 bg-[#131922] p-5">
      {/* Exercise header */}
      <div className="flex items-start gap-3">
        {/* Numbered badge */}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/8 text-xs font-semibold text-slate-400">
          {exerciseIndex}
        </span>

        <div className="min-w-0 flex-1">
          {/* Exercise name */}
          <h3 className="text-sm font-semibold text-white">{item.exercise_name}</h3>

          {/* Prescription badge */}
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#4f9cf9]/10 px-2.5 py-0.5">
            <svg
              className="h-3 w-3 text-[#4f9cf9]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <span className="text-xs font-medium text-[#4f9cf9]">
              Target: {prescriptionText(item.prescription)}
            </span>
          </div>
        </div>
      </div>

      {/* Set table */}
      <div className="mt-4">
        <SetTableEditor
          sets={sortedSets}
          exerciseId={item.exercise_id}
          dispatch={dispatch}
          setStatuses={setStatuses}
          onSaveSet={(setNumber) => onSaveSet(item.exercise_id, setNumber)}
        />
      </div>

      {/* Add set */}
      <button
        type="button"
        onClick={() => dispatch({ type: 'ADD_SET', exerciseId: item.exercise_id })}
        className="mt-3 text-xs font-medium text-[#4f9cf9] hover:text-[#7ab5fb]"
      >
        + Add set
      </button>
    </div>
  )
}
