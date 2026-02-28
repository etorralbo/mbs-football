'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { request, ValidationError } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { Button } from '@/app/_shared/components/Button'
import type { AiDraftResponse, SaveFromAiRequest } from '@/app/_shared/api/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSavePayload(draft: AiDraftResponse): SaveFromAiRequest {
  return {
    title: draft.title,
    blocks: draft.blocks.map((block) => ({
      name: block.name,
      notes: block.notes || null,
      items: block.suggested_exercises.map((ex, i) => ({
        exercise_id: ex.exercise_id,
        order: i,
      })),
    })),
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AiDraftPanel() {
  const [prompt, setPrompt] = useState('')
  const [language, setLanguage] = useState('en')
  const [draft, setDraft] = useState<AiDraftResponse | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const router = useRouter()

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed) return

    setDraftError(null)
    setDraft(null)
    setDraftLoading(true)

    try {
      const result = await request<AiDraftResponse>('/v1/ai/workout-template-draft', {
        method: 'POST',
        body: JSON.stringify({ prompt: trimmed, language }),
      })
      setDraft(result)
    } catch (err) {
      try {
        handleApiError(err, router)
      } catch (e) {
        setDraftError(
          e instanceof ValidationError
            ? (typeof e.detail === 'string' ? e.detail : 'Invalid request.')
            : 'Failed to generate draft. Please try again.',
        )
      }
    } finally {
      setDraftLoading(false)
    }
  }

  async function handleSave() {
    if (!draft) return

    setSaveError(null)
    setSaving(true)

    try {
      const result = await request<{ id: string }>('/v1/workout-templates/from-ai', {
        method: 'POST',
        body: JSON.stringify(toSavePayload(draft)),
      })
      router.push(`/templates/${result.id}?fromAi=1`)
    } catch (err) {
      try {
        handleApiError(err, router)
      } catch {
        setSaveError('Failed to save template. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">AI Workout Draft</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Describe the workout and the AI will generate a structured plan with six training blocks.
      </p>

      <form onSubmit={handleGenerate} className="mt-4 space-y-4">
        <div>
          <label htmlFor="ai-prompt" className="block text-sm font-medium text-zinc-700">
            Describe the workout
          </label>
          <textarea
            id="ai-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            maxLength={2000}
            className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="e.g. explosive power session for a midfielder, focus on lower body"
          />
        </div>

        <div>
          <label htmlFor="ai-language" className="block text-sm font-medium text-zinc-700">
            Language
          </label>
          <select
            id="ai-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
          </select>
        </div>

        {draftError && (
          <p role="alert" className="text-sm text-red-600">
            {draftError}
          </p>
        )}

        <Button type="submit" disabled={!prompt.trim()} loading={draftLoading}>
          {draftLoading ? 'Generating…' : 'Generate draft'}
        </Button>
      </form>

      {draft && (
        <div className="mt-8 border-t border-zinc-100 pt-6">
          <h3 className="text-sm font-semibold text-zinc-900">{draft.title}</h3>

          <div className="mt-4 space-y-4">
            {draft.blocks.map((block) => (
              <section
                key={block.name}
                aria-label={block.name}
                className="rounded-md border border-zinc-100 bg-zinc-50 p-4"
              >
                <h4 className="text-sm font-medium text-zinc-900">{block.name}</h4>
                {block.notes && (
                  <p className="mt-1 text-xs text-zinc-500">{block.notes}</p>
                )}
                {block.suggested_exercises.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {block.suggested_exercises.map((ex) => (
                      <li key={ex.exercise_id} className="text-xs text-zinc-600">
                        {ex.reason}{' '}
                        <span className="text-zinc-400">
                          ({Math.round(ex.score * 100)}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-zinc-400">No exercises suggested.</p>
                )}
              </section>
            ))}
          </div>

          {saveError && (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {saveError}
            </p>
          )}

          <Button
            variant="primary"
            onClick={handleSave}
            loading={saving}
            className="mt-6"
          >
            {saving ? 'Saving…' : 'Confirm & Save'}
          </Button>
        </div>
      )}
    </div>
  )
}
