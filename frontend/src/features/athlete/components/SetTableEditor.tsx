import type {
  AthleteAction,
  AthleteSetDraft,
  SetSaveStatus,
  SetStatusMap,
} from '@/src/features/athlete/athleteStore'
import { setKey } from '@/src/features/athlete/athleteStore'

interface SetEntry {
  setNumber: number
  draft: AthleteSetDraft
}

interface Props {
  sets: SetEntry[]
  exerciseId: string
  dispatch: (action: AthleteAction) => void
  setStatuses: SetStatusMap
  onSaveSet: (setNumber: number) => void
}

const inputClass =
  'w-full rounded-md border border-white/10 bg-[#0d1420] px-2 py-1.5 text-sm text-white focus:border-[#4f9cf9] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40'

// Grid: # | Load | Reps | RPE | Note | Status
const GRID = 'grid grid-cols-[1.5rem_1fr_1fr_1fr_2fr_1.5rem] items-center gap-2'

function hasData(draft: AthleteSetDraft): boolean {
  return (
    draft.actualLoad !== '' ||
    draft.actualReps !== '' ||
    draft.actualRpe !== ''
  )
}

function SetStatusCell({
  status,
  canSave,
  onSave,
}: {
  status: SetSaveStatus | undefined
  canSave: boolean
  onSave: () => void
}) {
  if (status?.status === 'saving') {
    return (
      <span aria-label="Saving…" className="flex items-center justify-center">
        <svg
          className="h-3.5 w-3.5 animate-spin text-[#4f9cf9]"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      </span>
    )
  }

  if (status?.status === 'saved') {
    return (
      <span aria-label="Saved" className="flex items-center justify-center">
        <svg
          className="h-3.5 w-3.5 text-emerald-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </span>
    )
  }

  if (status?.status === 'failed') {
    return (
      <button
        type="button"
        onClick={onSave}
        title={status.lastError ?? 'Save failed — click to retry'}
        aria-label="Save failed. Click to retry"
        className="flex items-center justify-center text-red-400 hover:text-red-300"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      </button>
    )
  }

  // idle — show save button only if the set has data
  if (canSave) {
    return (
      <button
        type="button"
        onClick={onSave}
        aria-label="Save set"
        className="flex items-center justify-center text-slate-500 hover:text-[#4f9cf9]"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4M12 3v13"
          />
        </svg>
      </button>
    )
  }

  return null
}

export function SetTableEditor({
  sets,
  exerciseId,
  dispatch,
  setStatuses,
  onSaveSet,
}: Props) {
  return (
    <div>
      {/* Column headers */}
      <div className={`mb-2 ${GRID} text-xs font-medium text-slate-500`}>
        <span>#</span>
        <span>Load (kg)</span>
        <span>Reps</span>
        <span>RPE</span>
        <span>Note</span>
        <span />
      </div>

      {/* Set rows */}
      <div className="space-y-2">
        {sets.map(({ setNumber, draft }) => {
          const key = setKey(exerciseId, setNumber)
          const status = setStatuses[key]
          const saving = status?.status === 'saving'

          return (
            <div
              key={setNumber}
              className={`${GRID} ${draft.done ? 'opacity-50' : ''}`}
            >
              <span className="text-xs font-medium text-slate-500">
                {setNumber}
              </span>

              <input
                type="number"
                inputMode="decimal"
                value={draft.actualLoad}
                disabled={draft.done || saving}
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
                disabled={draft.done || saving}
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
                disabled={draft.done || saving}
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
                disabled={draft.done || saving}
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

              <SetStatusCell
                status={status}
                canSave={!draft.done && hasData(draft)}
                onSave={() => onSaveSet(setNumber)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
