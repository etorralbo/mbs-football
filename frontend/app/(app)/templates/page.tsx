'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { Button } from '@/app/_shared/components/Button'
import { EmptyState } from '@/app/_shared/components/EmptyState'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { AiDraftPanel } from './AiDraftPanel'
import { ActivationBanner } from '@/src/features/activation/components/ActivationBanner'
import { useActivationState } from '@/src/features/activation/useActivationState'
import { useAuth } from '@/src/shared/auth/AuthContext'
import type { WorkoutTemplate } from '@/app/_shared/api/types'

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAiPanel, setShowAiPanel] = useState(false)
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

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Workout Templates</h1>
        <Button
          variant={showAiPanel ? 'secondary' : 'primary'}
          onClick={() => setShowAiPanel((v) => !v)}
        >
          {showAiPanel ? 'Close' : 'Create with AI'}
        </Button>
      </div>

      {showAiPanel && <AiDraftPanel />}

      <div className="mt-4">
        <ActivationBanner />
      </div>

      {loading && (
        <div className="mt-6">
          <span className="sr-only">Loading…</span>
          <SkeletonList rows={3} />
        </div>
      )}

      {error && (
        <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
          <button
            className="mt-2 text-sm font-medium text-red-700 underline"
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
            primaryAction={{ label: 'Create with AI', onClick: () => setShowAiPanel(true) }}
          />
        )
      )}

      {!loading && templates.length > 0 && (
        <ul className="mt-6 space-y-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Link
                href={`/templates/${t.id}`}
                className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
              >
                <span className="text-sm font-medium text-zinc-900">{t.title}</span>
                {t.description && (
                  <span className="mt-1 text-xs text-zinc-500">{t.description}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
