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

function toSavePayload(draft: AiDraftResponse, title: string): SaveFromAiRequest {
  return {
    title,
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
  const [name, setName] = useState('')
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
        body: JSON.stringify(toSavePayload(draft, name.trim())),
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
    <div className="mt-6 rounded-lg border border-white/8 bg-[#131922] p-6">
      <h2 className="text-base font-semibold text-white">AI Workout Draft</h2>
      <p className="mt-1 text-sm text-slate-400">
        Describe the workout and the AI will generate a structured plan with six training blocks.
      </p>

      <form onSubmit={handleGenerate} className="mt-4 space-y-4">
        <div>
          <label htmlFor="ai-name" className="block text-sm font-medium text-slate-300">
            Template name
          </label>
          <input
            id="ai-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={3}
            maxLength={255}
            className="mt-1.5 w-full rounded-md border border-white/10 bg-[#0d1420] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
            placeholder="e.g. Power Session A"
          />
        </div>

        <div>
          <label htmlFor="ai-prompt" className="block text-sm font-medium text-slate-300">
            Describe the workout
          </label>
          <textarea
            id="ai-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            maxLength={2000}
            className="mt-1.5 w-full rounded-md border border-white/10 bg-[#0d1420] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
            placeholder="e.g. explosive power session for a midfielder, focus on lower body"
          />
        </div>

        <div>
          <label htmlFor="ai-language" className="block text-sm font-medium text-slate-300">
            Language
          </label>
          <select
            id="ai-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1.5 rounded-md border border-white/10 bg-[#0d1420] px-3 py-2 text-sm text-white focus:border-[#4f9cf9] focus:outline-none"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
          </select>
        </div>

        {draftError && (
          <p role="alert" className="text-sm text-red-400">
            {draftError}
          </p>
        )}

        <Button type="submit" disabled={!prompt.trim() || name.trim().length < 3} loading={draftLoading}>
          {draftLoading ? 'Generating…' : 'Generate draft'}
        </Button>
      </form>

      {draft && (
        <div className="mt-8 border-t border-white/8 pt-6">
          <h3 className="text-sm font-semibold text-white">{draft.title}</h3>

          <div className="mt-4 space-y-4">
            {draft.blocks.map((block) => (
              <section
                key={block.name}
                aria-label={block.name}
                className="rounded-md border border-white/8 bg-[#0d1420] p-4"
              >
                <h4 className="text-sm font-medium text-white">{block.name}</h4>
                {block.notes && (
                  <p className="mt-1 text-xs text-slate-400">{block.notes}</p>
                )}
                {block.suggested_exercises.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {block.suggested_exercises.map((ex) => (
                      <li key={ex.exercise_id} className="text-xs text-slate-300">
                        {ex.reason}{' '}
                        <span className="text-slate-500">
                          ({Math.round(ex.score * 100)}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No exercises suggested.</p>
                )}
              </section>
            ))}
          </div>

          {saveError && (
            <p role="alert" className="mt-4 text-sm text-red-400">
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
