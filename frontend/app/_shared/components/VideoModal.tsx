'use client'

/**
 * VideoModal
 *
 * Modal that safely embeds a YouTube video using the privacy-enhanced domain.
 *
 * Security:
 *  - Embed URL is ALWAYS derived from `video.external_id` (a validated 11-char ID).
 *  - Never uses raw user-provided URLs for the iframe src.
 *  - No dangerouslySetInnerHTML.
 *  - Only supports YOUTUBE provider (enforced by the ExerciseVideo type).
 *
 * Accessibility:
 *  - role="dialog" + aria-modal + aria-labelledby
 *  - Focus trapped within the modal while open
 *  - Escape key closes
 *  - Backdrop click closes
 *  - iframe has title for screen readers
 *
 * Resilience:
 *  - If the video is unavailable (deleted from YouTube), the iframe shows
 *    YouTube's native "Video unavailable" screen — no crash, no broken UI.
 */

import { useEffect, useRef } from 'react'
import type { ExerciseVideo } from '@/app/_shared/api/types'

interface Props {
  video: ExerciseVideo
  /** Used as the dialog label and iframe title. */
  title: string
  onClose: () => void
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function VideoModal({ video, title, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = 'video-modal-title'

  // Embed URL derived from external_id only — never from raw user input.
  // youtube-nocookie.com: privacy-enhanced mode (no tracking cookies).
  // rel=0: suppress "related videos" from other channels on end.
  const embedUrl = `https://www.youtube-nocookie.com/embed/${video.external_id}?rel=0`

  // Focus trap
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    // Focus the dialog container on mount
    dialog.focus()

    const el = dialog  // narrow type for closure
    function handleKeyDown(e: KeyboardEvent) {
      const dialog = el
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    dialog.addEventListener('keydown', handleKeyDown)
    return () => dialog.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-3xl mx-4 rounded-xl border border-white/10 bg-[#0d1420] shadow-2xl focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p id={titleId} className="text-sm font-medium text-white truncate pr-4">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close video"
            className="shrink-0 rounded p-1 text-slate-400 hover:text-white hover:bg-white/8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135]/50"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Video embed — 16:9 aspect ratio.
            If the video is unavailable or deleted on YouTube, the iframe will
            show YouTube's own "Video unavailable" screen. No additional handling
            needed — the athlete flow remains intact either way. */}
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            src={embedUrl}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 w-full h-full rounded-b-xl"
          />
        </div>
      </div>
    </div>
  )
}
