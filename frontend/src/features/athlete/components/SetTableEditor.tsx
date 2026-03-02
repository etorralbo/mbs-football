import type { AthleteAction, AthleteSetDraft } from '@/src/features/athlete/athleteStore'

interface SetEntry {
  setNumber: number
  draft: AthleteSetDraft
}

interface Props {
  sets: SetEntry[]
  exerciseId: string
  dispatch: (action: AthleteAction) => void
}

const inputClass =
  'w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-900 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:text-zinc-400'

export function SetTableEditor({ sets, exerciseId, dispatch }: Props) {
  return (
    <div>
      {/* Column headers */}
      <div className="mb-2 grid grid-cols-[1.5rem_1fr_1fr_1fr_2fr] items-center gap-2 text-xs font-medium text-zinc-400">
        <span>#</span>
        <span>Load (kg)</span>
        <span>Reps</span>
        <span>RPE</span>
        <span>Note</span>
      </div>

      {/* Set rows */}
      <div className="space-y-2">
        {sets.map(({ setNumber, draft }) => (
          <div
            key={setNumber}
            className={`grid grid-cols-[1.5rem_1fr_1fr_1fr_2fr] items-center gap-2 ${
              draft.done ? 'opacity-50' : ''
            }`}
          >
            <span className="text-xs font-medium text-zinc-500">
              {setNumber}
            </span>

            <input
              type="number"
              inputMode="decimal"
              value={draft.actualLoad}
              disabled={draft.done}
              onChange={(e) =>
                dispatch({
                  type: 'UPDATE_SET',
                  exerciseId,
                  setNumber,
                  field: 'actualLoad',
                  value: e.target.value,
                })
              }
              placeholder="—"
              aria-label={`Set ${setNumber} load`}
              className={inputClass}
            />

            <input
              type="number"
              inputMode="numeric"
              value={draft.actualReps}
              disabled={draft.done}
              onChange={(e) =>
                dispatch({
                  type: 'UPDATE_SET',
                  exerciseId,
                  setNumber,
                  field: 'actualReps',
                  value: e.target.value,
                })
              }
              placeholder="—"
              aria-label={`Set ${setNumber} reps`}
              className={inputClass}
            />

            <input
              type="number"
              inputMode="decimal"
              min="1"
              max="10"
              step="0.5"
              value={draft.actualRpe}
              disabled={draft.done}
              onChange={(e) =>
                dispatch({
                  type: 'UPDATE_SET',
                  exerciseId,
                  setNumber,
                  field: 'actualRpe',
                  value: e.target.value,
                })
              }
              placeholder="—"
              aria-label={`Set ${setNumber} RPE`}
              className={inputClass}
            />

            <input
              type="text"
              value={draft.note}
              disabled={draft.done}
              onChange={(e) =>
                dispatch({
                  type: 'UPDATE_SET',
                  exerciseId,
                  setNumber,
                  field: 'note',
                  value: e.target.value,
                })
              }
              placeholder="optional"
              aria-label={`Set ${setNumber} note`}
              className={inputClass}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
