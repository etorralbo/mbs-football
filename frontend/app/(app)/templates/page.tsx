'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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
// NewTemplateForm — inline creation form
// ---------------------------------------------------------------------------

interface NewTemplateFormProps {
  onCreated: (template: WorkoutTemplate) => void
  onCancel: () => void
}

function NewTemplateForm({ onCreated, onCancel }: NewTemplateFormProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    titleRef.current?.focus()
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
    <form
      onSubmit={handleSubmit}
      className="mb-6 rounded-xl border border-white/10 bg-[#161e27] p-5"
      aria-label="New template form"
    >
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
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-[#c8f135] px-4 py-1.5 text-sm font-bold text-black transition-colors hover:bg-[#d4f755] disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/10 px-4 py-1.5 text-sm text-slate-400 transition-colors hover:text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: 'draft' | 'published' }) {
  if (status === 'published') {
    return (
      <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-[10px] font-bold text-green-400">
        PUBLISHED
      </span>
    )
  }
  return (
    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-400">
      DRAFT
    </span>
  )
}

// ---------------------------------------------------------------------------
// TemplateCard
// ---------------------------------------------------------------------------

function TemplateCard({ template }: { template: WorkoutTemplate }) {
  return (
    <Link
      href={`/templates/${template.id}`}
      className="group flex flex-col rounded-2xl border border-[#2d3748] bg-[#161e27] p-5 transition-all hover:border-slate-500"
    >
      <div className="mb-4">
        <StatusBadge status={template.status} />
      </div>
      <div className="flex-1">
        <h3 className="text-lg font-bold text-white transition-colors group-hover:text-[#c8f135]">
          {template.title}
        </h3>
        {template.description && (
          <p className="mt-1 line-clamp-2 text-xs italic text-slate-400">
            {template.description}
          </p>
        )}
      </div>
      <div className="mt-6 border-t border-slate-800 pt-4">
        <span className="text-xs font-bold text-[#c8f135] group-hover:underline">
          {template.status === 'draft' ? 'Continue Setup' : 'View Template'}
        </span>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// NewTemplateCard — dashed placeholder
// ---------------------------------------------------------------------------

function NewTemplateCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-800 bg-white/5 p-8 text-center transition-all hover:border-slate-700"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 transition-colors group-hover:bg-[#c8f135] group-hover:text-black">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <h3 className="font-bold text-slate-300">New Template</h3>
      <p className="mt-2 max-w-[150px] text-xs text-slate-500">
        Start building a new workout from scratch.
      </p>
    </button>
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
  const [showNewForm, setShowNewForm] = useState(false)
  const router = useRouter()
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

  function handleNewTemplateCreated(template: WorkoutTemplate) {
    setShowNewForm(false)
    router.push(`/templates/${template.id}`)
  }

  const isCoach = role !== 'ATHLETE'

  return (
    <>
      <PageHeader
        title="Workout Templates"
        subtitle="Design and manage structured training plans for your athletes."
        actions={isCoach ? (
          <>
            <button
              type="button"
              onClick={() => {
                setShowAiPanel((v) => !v)
                setShowNewForm(false)
              }}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition-all hover:opacity-90"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              {showAiPanel ? 'Close AI' : 'Create with AI'}
            </button>
            {showNewForm ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setShowNewForm(false)
                  setShowAiPanel(false)
                }}
              >
                Cancel
              </Button>
            ) : (
              <CreateButton
                onClick={() => {
                  setShowNewForm(true)
                  setShowAiPanel(false)
                }}
              >
                New Template
              </CreateButton>
            )}
          </>
        ) : undefined}
      />

      {/* Inline forms */}
      {showNewForm && isCoach && (
        <NewTemplateForm
          onCreated={handleNewTemplateCreated}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {showAiPanel && <AiDraftPanel />}

      {/* Spacer between forms and grid */}
      {(showNewForm || showAiPanel) && <div className="mt-8" />}

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
            title="No templates yet"
            description="Create your first template and assign it to your team."
            primaryAction={{ label: 'New Template', onClick: () => setShowNewForm(true) }}
          />
        )
      )}

      {/* Template grid */}
      {!loading && templates.length > 0 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
          {isCoach && (
            <NewTemplateCard onClick={() => {
              setShowNewForm(true)
              setShowAiPanel(false)
            }} />
          )}
        </div>
      )}
    </>
  )
}
