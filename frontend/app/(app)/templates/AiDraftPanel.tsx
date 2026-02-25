'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { request, ValidationError } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
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
      router.push(`/templates/${result.id}`)
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
    <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-6">
      <h2 className="text-lg font-semibold text-gray-900">AI Workout Draft</h2>

      <form onSubmit={handleGenerate} className="mt-4 space-y-4">
        <div>
          <label htmlFor="ai-prompt" className="block text-sm font-medium text-gray-700">
            Describe the workout
          </label>
          <textarea
            id="ai-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            maxLength={2000}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. explosive power session for a midfielder, focus on lower body"
          />
        </div>

        <div>
          <label htmlFor="ai-language" className="block text-sm font-medium text-gray-700">
            Language
          </label>
          <select
            id="ai-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

        <button
          type="submit"
          disabled={!prompt.trim() || draftLoading}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {draftLoading ? 'Generating…' : 'Generate draft'}
        </button>
      </form>

      {draft && (
        <div className="mt-8">
          <h3 className="text-base font-semibold text-gray-900">{draft.title}</h3>

          <div className="mt-4 space-y-6">
            {draft.blocks.map((block) => (
              <section key={block.name} aria-label={block.name}>
                <h4 className="font-medium text-gray-900">{block.name}</h4>
                {block.notes && (
                  <p className="mt-1 text-sm text-gray-500">{block.notes}</p>
                )}
                {block.suggested_exercises.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {block.suggested_exercises.map((ex) => (
                      <li key={ex.exercise_id} className="text-sm text-gray-700">
                        {ex.reason}{' '}
                        <span className="text-xs text-gray-400">
                          ({Math.round(ex.score * 100)}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-gray-400">No exercises suggested.</p>
                )}
              </section>
            ))}
          </div>

          {saveError && (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {saveError}
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-6 rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Confirm & Save'}
          </button>
        </div>
      )}
    </div>
  )
}
