'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { Button } from '@/app/_shared/components/Button'
import { EmptyState } from '@/app/_shared/components/EmptyState'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
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
      className="mt-4 rounded-lg border border-white/10 bg-[#131922] p-4"
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
        className="w-full rounded-md border border-white/10 bg-[#0d1420] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
      />
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-red-400">{error}</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[#4f9cf9] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#3a8ae8] disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-white/10 px-4 py-1.5 text-sm text-slate-400 transition-colors hover:text-white"
        >
          Cancel
        </button>
      </div>
    </form>
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Workout Templates</h1>
        {isCoach && (
          <div className="flex gap-2">
            <Button
              variant={showNewForm ? 'secondary' : 'primary'}
              onClick={() => {
                setShowNewForm((v) => !v)
                setShowAiPanel(false)
              }}
            >
              {showNewForm ? 'Cancel' : '+ New Template'}
            </Button>
            <Button
              variant={showAiPanel ? 'secondary' : 'secondary'}
              onClick={() => {
                setShowAiPanel((v) => !v)
                setShowNewForm(false)
              }}
            >
              {showAiPanel ? 'Close' : 'Create with AI'}
            </Button>
          </div>
        )}
      </div>

      {showNewForm && isCoach && (
        <NewTemplateForm
          onCreated={handleNewTemplateCreated}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {showAiPanel && <AiDraftPanel />}

      {loading && (
        <div className="mt-6">
          <span className="sr-only">Loading…</span>
          <SkeletonList rows={3} />
        </div>
      )}

      {error && (
        <div role="alert" className="mt-6 rounded-lg border border-red-800/50 bg-red-900/20 p-4">
          <p className="text-sm text-red-400">{error}</p>
          <button
            className="mt-2 text-sm font-medium text-red-400 underline hover:text-red-300"
            onClick={fetchTemplates}
          >
            Try again
          </button>
        </div>
      )}

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
            primaryAction={{ label: '+ New Template', onClick: () => setShowNewForm(true) }}
          />
        )
      )}

      {!loading && templates.length > 0 && (
        <ul className="mt-6 space-y-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Link
                href={`/templates/${t.id}`}
                className="flex flex-col rounded-lg border border-white/8 bg-[#131922] p-4 transition-colors hover:border-white/15 hover:bg-white/5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{t.title}</span>
                  {t.status === 'published' ? (
                    <span className="rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs font-medium text-emerald-400">
                      Published
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
                      Draft
                    </span>
                  )}
                </div>
                {t.description && (
                  <span className="mt-1 text-xs text-slate-400">{t.description}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
