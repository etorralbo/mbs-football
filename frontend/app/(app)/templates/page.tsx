'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { AiDraftPanel } from './AiDraftPanel'
import type { WorkoutTemplate } from '@/app/_shared/api/types'

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const router = useRouter()

  useEffect(() => {
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
  }, [router])

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Workout Templates</h1>
        <button
          onClick={() => setShowAiPanel((v) => !v)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showAiPanel ? 'Close' : 'Create with AI'}
        </button>
      </div>

      {showAiPanel && <AiDraftPanel />}

      {loading && <p className="mt-6 text-sm text-gray-500">Loading…</p>}

      {error && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {error}
        </p>
      )}

      {!loading && !error && templates.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">
          No templates yet. Use &quot;Create with AI&quot; to get started.
        </p>
      )}

      {!loading && templates.length > 0 && (
        <ul className="mt-6 divide-y divide-gray-200">
          {templates.map((t) => (
            <li key={t.id} className="py-4">
              <Link
                href={`/templates/${t.id}`}
                className="text-base font-medium text-gray-900 hover:underline"
              >
                {t.title}
              </Link>
              {t.description && (
                <p className="mt-1 text-sm text-gray-500">{t.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
