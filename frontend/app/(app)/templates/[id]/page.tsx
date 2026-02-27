'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { AssignPanel } from './AssignPanel'
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

  if (loading)
    return (
      <div>
        <span className="sr-only">Loading…</span>
        <SkeletonList rows={4} />
      </div>
    )

  if (notFound || !template)
    return (
      <p className="text-sm text-zinc-500">Template not found.</p>
    )

  return (
    <>
      <div className="flex items-center gap-2">
        <Link href="/templates" className="text-sm text-zinc-500 hover:text-zinc-700">
          Templates
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="text-sm text-zinc-900">{template.title}</span>
      </div>

      <h1 className="mt-4 text-xl font-semibold text-zinc-900">{template.title}</h1>
      {template.description && (
        <p className="mt-1 text-sm text-zinc-500">{template.description}</p>
      )}

      <AssignPanel templateId={id} />

      <div className="mt-8 space-y-4">
        {template.blocks.map((block) => (
          <section key={block.id} className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-zinc-900">{block.name}</h2>
            {block.notes && (
              <p className="mt-1 text-xs text-zinc-500">{block.notes}</p>
            )}
            {block.items.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {block.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" aria-hidden="true" />
                    <span className="text-sm text-zinc-700">{item.exercise.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-zinc-400">No exercises assigned.</p>
            )}
          </section>
        ))}
      </div>
    </>
  )
}
