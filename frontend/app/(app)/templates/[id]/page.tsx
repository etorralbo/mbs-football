'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import type { WorkoutTemplateDetail } from '@/app/_shared/api/types'

export default function TemplateDetailPage() {
  const { id } = useParams() as { id: string }
  const [template, setTemplate] = useState<WorkoutTemplateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const router = useRouter()

  useEffect(() => {
    request<WorkoutTemplateDetail>(`/v1/workout-templates/${id}`)
      .then(setTemplate)
      .catch((err: unknown) => {
        try {
          handleApiError(err, router)
        } catch {
          setNotFound(true)
        }
      })
      .finally(() => setLoading(false))
  }, [id, router])

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>
  if (notFound || !template) return <p className="text-sm text-gray-500">Template not found.</p>

  return (
    <>
      <h1 className="text-2xl font-semibold text-gray-900">{template.title}</h1>
      {template.description && (
        <p className="mt-2 text-sm text-gray-500">{template.description}</p>
      )}

      <div className="mt-8 space-y-8">
        {template.blocks.map((block) => (
          <section key={block.id}>
            <h2 className="text-lg font-medium text-gray-900">{block.name}</h2>
            {block.notes && (
              <p className="mt-1 text-sm text-gray-500">{block.notes}</p>
            )}
            <ul className="mt-3 space-y-1">
              {block.items.map((item) => (
                <li key={item.id} className="text-sm text-gray-700">
                  {item.exercise.name}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}
