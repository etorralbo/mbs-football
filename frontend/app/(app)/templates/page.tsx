'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { Button } from '@/app/_shared/components/Button'
import { CreateButton } from '@/app/_shared/components/CreateButton'
import { PageHeader } from '@/app/_shared/components/PageHeader'
import { EmptyState } from '@/app/_shared/components/EmptyState'
import { SkeletonGrid } from '@/app/_shared/components/Skeleton'
import { AiDraftPanel } from './AiDraftPanel'
import { useActivationState } from '@/src/features/activation/useActivationState'
import { useAuth } from '@/src/shared/auth/AuthContext'
import type { WorkoutTemplate } from '@/app/_shared/api/types'

// ---------------------------------------------------------------------------
// NewTemplateDrawer — right-side drawer for creating a template
// ---------------------------------------------------------------------------

interface NewTemplateDrawerProps {
  onCreated: (template: WorkoutTemplate) => void
  onClose: () => void
}

function NewTemplateDrawer({ onCreated, onClose }: NewTemplateDrawerProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(document.activeElement)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Focus title input on mount
  useEffect(() => { titleRef.current?.focus() }, [])

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const close = useCallback(() => {
    const el = triggerRef.current
    if (el && 'focus' in el) (el as HTMLElement).focus()
    onClose()
  }, [onClose])

  // Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [close])

  // Focus trap
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const title = titleRef.current?.value.trim() ?? ''
    if (title.length < 3) {
      setError('Title must be at least 3 characters.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const template = await request<WorkoutTemplate>('/v1/workout-templates', {
        method: 'POST',
        body: JSON.stringify({ title }),
      })
      onCreated(template)
    } catch {
      setError('Failed to create template. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="New template"
        className="relative flex w-full max-w-md animate-[slideIn_200ms_ease-out] flex-col bg-slate-950 shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-base font-bold text-white">New template</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <form onSubmit={handleSubmit} aria-label="New template form">
            <label htmlFor="new-template-title" className="mb-1.5 block text-xs font-medium text-slate-400">
              Template title
            </label>
            <input
              id="new-template-title"
              ref={titleRef}
              type="text"
              required
              minLength={3}
              maxLength={255}
              placeholder="e.g. Strength Day A"
              className="w-full rounded-lg border border-white/10 bg-[#0d1420] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
            />
            {error && (
              <p role="alert" className="mt-1.5 text-xs text-red-400">{error}</p>
            )}
            <div className="mt-4 flex gap-2">
              <Button type="submit" disabled={submitting} loading={submitting} className="flex-1">
                {submitting ? 'Creating…' : 'Create template'}
              </Button>
              <Button type="button" variant="secondary" onClick={close} className="flex-1">
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: 'draft' | 'published' }) {
  if (status === 'published') {
    return (
      <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-0.5 text-[10px] font-bold text-green-400">
        PUBLISHED
      </span>
    )
  }
  return (
    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">
      DRAFT
    </span>
  )
}

// ---------------------------------------------------------------------------
// KebabMenu — per-card actions
// ---------------------------------------------------------------------------

function KebabMenu({
  onDuplicate,
  onDelete,
}: {
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Template actions"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/8 hover:text-slate-300"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-white/10 bg-[#131922] py-1 shadow-xl"
        >
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 transition-colors hover:bg-white/8"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
              onDuplicate()
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
            Duplicate
          </button>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-400 transition-colors hover:bg-white/8"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
              onDelete()
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diffMs = now - then
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// TemplateCard
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  highlighted = false,
  onDuplicate,
  onDelete,
}: {
  template: WorkoutTemplate
  highlighted?: boolean
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <div
      data-highlight={highlighted ? 'true' : undefined}
      className="group relative flex flex-col rounded-xl border border-white/8 bg-[#131922] p-5 transition-all duration-150 ease-out hover:-translate-y-1 hover:border-white/20 hover:shadow-lg"
    >
      <div className="mb-3 flex items-center justify-between">
        <StatusBadge status={template.status} />
        <KebabMenu onDuplicate={onDuplicate} onDelete={onDelete} />
      </div>
      <Link href={`/templates/${template.id}`} className="flex flex-1 flex-col">
        <div className="flex-1">
          <h3 className="text-base font-semibold text-white transition-colors group-hover:text-[#c8f135]">
            {template.title}
          </h3>
          {template.description && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-400">
              {template.description}
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-slate-500">
            Last edited {formatRelativeTime(template.updated_at)}
          </p>
        </div>
        <div className="mt-4 border-t border-white/8 pt-3">
          <span className="text-xs font-medium text-[#c8f135] group-hover:underline">
            {template.status === 'draft' ? 'Edit template' : 'View template'}
          </span>
        </div>
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// NewTemplateDropdown — "New Template" button with dropdown
// ---------------------------------------------------------------------------

function NewTemplateDropdown({
  onStartFromScratch,
  onGenerateWithAi,
}: {
  onStartFromScratch: () => void
  onGenerateWithAi: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <CreateButton onClick={() => setOpen((v) => !v)}>
        New Template
      </CreateButton>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-2 w-52 rounded-lg border border-white/10 bg-[#131922] py-1 shadow-xl"
        >
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-white/8"
            onClick={() => {
              setOpen(false)
              onStartFromScratch()
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Start from scratch
          </button>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-white/8"
            onClick={() => {
              setOpen(false)
              onGenerateWithAi()
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            Generate with AI
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TemplatesPage
// ---------------------------------------------------------------------------

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { role } = useActivationState()
  const { role: authRole, loading: authLoading } = useAuth()

  // UX guard: ATHLETE should not access templates (backend RBAC is the real authority).
  useEffect(() => {
    if (!authLoading && authRole === 'ATHLETE') {
      router.replace('/sessions')
    }
  }, [authLoading, authRole, router])

  function fetchTemplates() {
    setLoading(true)
    setError(null)
    request<WorkoutTemplate[]>('/v1/workout-templates')
      .then(setTemplates)
      .catch((err: unknown) => {
        try {
          handleApiError(err, router)
        } catch {
          setError('Failed to load templates. Please try again.')
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchTemplates()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // Highlight from URL param (e.g. after returning from template detail)
  useEffect(() => {
    const id = searchParams.get('highlight')
    if (id) {
      highlightTemplate(id)
      // Clean up URL without triggering navigation
      window.history.replaceState(null, '', window.location.pathname)
    }
    return () => { if (highlightTimer.current) clearTimeout(highlightTimer.current) }
  }, [searchParams])

  function highlightTemplate(id: string) {
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    setHighlightedId(id)
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 2500)
  }

  function handleNewTemplateCreated(template: WorkoutTemplate) {
    setShowDrawer(false)
    router.push(`/templates/${template.id}`)
  }

  async function handleDuplicate(template: WorkoutTemplate) {
    try {
      const dup = await request<WorkoutTemplate>('/v1/workout-templates', {
        method: 'POST',
        body: JSON.stringify({ title: `${template.title} (copy)` }),
      })
      setTemplates((prev) => [dup, ...prev])
      highlightTemplate(dup.id)
    } catch {
      // Silently fail — user can retry via UI
    }
  }

  async function handleDelete(template: WorkoutTemplate) {
    try {
      await request<void>(`/v1/workout-templates/${template.id}`, {
        method: 'DELETE',
      })
      setTemplates((prev) => prev.filter((t) => t.id !== template.id))
    } catch {
      // Silently fail — user can retry via UI
    }
  }

  const isCoach = role !== 'ATHLETE'

  return (
    <>
      <PageHeader
        title="Workout Templates"
        subtitle="Design and manage structured training plans for your athletes."
        actions={isCoach ? (
          <NewTemplateDropdown
            onStartFromScratch={() => {
              setShowDrawer(true)
              setShowAiPanel(false)
            }}
            onGenerateWithAi={() => {
              setShowAiPanel((v) => !v)
              setShowDrawer(false)
            }}
          />
        ) : undefined}
      />

      {showAiPanel && <AiDraftPanel />}

      {/* Loading */}
      {loading && (
        <div>
          <span className="sr-only">Loading…</span>
          <SkeletonGrid />
        </div>
      )}

      {/* Error */}
      {error && (
        <div role="alert" className="rounded-xl border border-red-800/50 bg-red-900/20 p-4">
          <p className="text-sm text-red-400">{error}</p>
          <button
            className="mt-2 text-sm font-medium text-red-400 underline hover:text-red-300"
            onClick={fetchTemplates}
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && templates.length === 0 && (
        role === 'ATHLETE' ? (
          <EmptyState
            title="No templates yet"
            description="Templates are created by your coach."
          />
        ) : (
          <EmptyState
            title="You don&apos;t have any templates yet."
            description="Templates help you design structured workouts for your athletes."
            primaryAction={{ label: 'Create your first template', onClick: () => setShowDrawer(true) }}
          />
        )
      )}

      {/* Template grid */}
      {!loading && templates.length > 0 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              highlighted={t.id === highlightedId}
              onDuplicate={() => handleDuplicate(t)}
              onDelete={() => handleDelete(t)}
            />
          ))}
        </div>
      )}

      {/* Create template drawer */}
      {showDrawer && (
        <NewTemplateDrawer
          onCreated={handleNewTemplateCreated}
          onClose={() => setShowDrawer(false)}
        />
      )}
    </>
  )
}
