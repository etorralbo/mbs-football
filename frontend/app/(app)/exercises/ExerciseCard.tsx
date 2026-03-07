'use client'

/**
 * ExerciseCard
 *
 * Renders a single exercise in the library list.
 * Quick actions are revealed on hover (CSS group + opacity transition).
 *
 * Actions:
 *   ⭐ Favorite   — optimistic toggle (reverts on error)
 *   ✏️ Edit       — COACH only (opens form in parent)
 *   ⧉ Duplicate  — COACH only (creates a copy)
 *   🗑 Delete     — COACH only (requires confirmation modal)
 *
 * No dangerouslySetInnerHTML anywhere — all text via JSX.
 */

import { Badge } from '@/app/_shared/components/Badge'
import type { Exercise } from '@/app/_shared/api/types'

interface Props {
  exercise: Exercise
  highlighted?: boolean
  onFavoriteToggle: (id: string) => void
  onEdit: (exercise: Exercise) => void
  onDuplicate: (exercise: Exercise) => void
  onDelete: (exercise: Exercise) => void
}

export default function ExerciseCard({
  exercise,
  highlighted = false,
  onFavoriteToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: Props) {
  const isOfficial = exercise.owner_type === 'COMPANY'
  const canMutate = exercise.is_editable !== false

  return (
    <li data-highlight={highlighted ? 'true' : undefined} className="group relative flex items-start justify-between gap-3 rounded-lg border border-white/8 bg-[#131922] px-4 py-3 transition-all duration-150 hover:border-white/20 hover:shadow-md">
      {/* Left: content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {isOfficial && (
            <Badge variant="info">Official</Badge>
          )}
          <p className="text-sm font-medium text-white">{exercise.name}</p>
        </div>

        {exercise.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{exercise.description}</p>
        )}

        {exercise.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {exercise.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-500"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Right: quick actions (always visible on mobile, hover-revealed on desktop) */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
        {/* Favorite */}
        <button
          type="button"
          onClick={() => onFavoriteToggle(exercise.id)}
          aria-label={exercise.is_favorite ? `Remove ${exercise.name} from favourites` : `Add ${exercise.name} to favourites`}
          className="rounded p-1.5 text-slate-600 transition-colors hover:bg-white/8 hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135]/50"
        >
          <StarIcon filled={exercise.is_favorite} />
        </button>

        {/* Edit — COACH only */}
        {canMutate && (
          <button
            type="button"
            onClick={() => onEdit(exercise)}
            aria-label={`Edit ${exercise.name}`}
            className="rounded p-1.5 text-slate-600 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135]/50"
          >
            <EditIcon />
          </button>
        )}

        {/* Duplicate — always available (COMPANY → "to my library", COACH → copy) */}
        <button
          type="button"
          onClick={() => onDuplicate(exercise)}
          aria-label={isOfficial ? `Duplicate ${exercise.name} to my library` : `Duplicate ${exercise.name}`}
          className="rounded p-1.5 text-slate-600 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135]/50"
        >
          <DuplicateIcon />
        </button>

        {/* Delete — COACH only */}
        {canMutate && (
          <button
            type="button"
            onClick={() => onDelete(exercise)}
            aria-label={`Delete ${exercise.name}`}
            className="rounded p-1.5 text-slate-600 transition-colors hover:bg-red-900/30 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Icon helpers — inline SVGs, no external dependency
// ---------------------------------------------------------------------------

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}

function DuplicateIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}
