'use client'

/**
 * ExerciseEditorDrawer
 *
 * Right-side sheet for creating or editing an exercise.
 * Overlays the exercise list — list remains visible behind the backdrop.
 *
 * Features:
 *  - Focus trap + Escape key
 *  - Body scroll lock
 *  - Unsaved-changes guard (dirty form → "Discard changes?" confirm)
 *  - Mobile: full-width; desktop: max-w-md
 *  - Reuses ExerciseForm (no footer duplication)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import ExerciseForm, { type ExerciseFormValues } from './ExerciseForm'
import type { Exercise } from '@/app/_shared/api/types'

interface Props {
  /** Exercise to edit (null = create mode). */
  exercise: Exercise | null
  /** Called when the form is submitted. */
  onSubmit: (values: ExerciseFormValues) => Promise<void>
  /** Called when the drawer should close. */
  onClose: () => void
  /** Whether the outer submit is in progress. */
  submitting?: boolean
  /** Optional error from the outer submit call. */
  submitError?: string | null
}

export function ExerciseEditorDrawer({
  exercise,
  onSubmit,
  onClose,
  submitting = false,
  submitError = null,
}: Props) {
  const [isDirty, setIsDirty] = useState(false)
  const [showDiscard, setShowDiscard] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(document.activeElement)

  // Restore focus to the trigger element when the drawer closes
  const close = useCallback(() => {
    const el = triggerRef.current
    if (el && 'focus' in el) (el as HTMLElement).focus()
    onClose()
  }, [onClose])

  const title = exercise ? `Edit: ${exercise.name}` : 'New exercise'
  const formInitial = exercise
    ? {
        name: exercise.name,
        description: exercise.description,
        tags: exercise.tags,
        videoUrl: exercise.video?.url ?? '',
      }
    : undefined

  // --- Body scroll lock ---
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // --- Attempt close (with dirty guard) ---
  const attemptClose = useCallback(() => {
    if (isDirty) {
      setShowDiscard(true)
    } else {
      close()
    }
  }, [isDirty, close])

  // --- Escape key ---
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showDiscard) return // let discard dialog handle its own state
        attemptClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [attemptClose, showDiscard])

  // --- Focus trap ---
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !panel) return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={attemptClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex w-full max-w-md animate-[slideIn_200ms_ease-out] flex-col bg-slate-950 shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button
            type="button"
            onClick={attemptClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ExerciseForm
            initial={formInitial}
            onSubmit={onSubmit}
            onCancel={attemptClose}
            submitting={submitting}
            submitError={submitError}
            onDirtyChange={setIsDirty}
          />
        </div>
      </div>

      {/* Discard confirmation overlay */}
      {showDiscard && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Discard changes"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#131922] p-6 shadow-2xl">
            <h2 className="text-sm font-semibold text-white">Discard changes?</h2>
            <p className="mt-2 text-xs text-slate-400">
              You have unsaved changes. Are you sure you want to close?
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={close}
                className="flex-1 rounded-md bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/30 transition-colors"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => setShowDiscard(false)}
                className="flex-1 rounded-md border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/5 transition-colors"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
