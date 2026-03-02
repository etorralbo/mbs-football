'use client'

import { useEffect, useState } from 'react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { AssignPanel } from './AssignPanel'
import { BlockEditor } from './BlockEditor'
import type {
  BlockItem,
  WorkoutBlock,
  WorkoutBlockSummary,
  WorkoutTemplateDetail,
} from '@/app/_shared/api/types'

// Block names coaches can choose from when adding a new block
const BLOCK_NAME_OPTIONS = [
  'Preparation to Movement',
  'Plyometrics',
  'Primary Strength',
  'Secondary Strength',
  'Auxiliary Strength',
  'Recovery',
]

// ---------------------------------------------------------------------------
// AddBlockForm
// ---------------------------------------------------------------------------

interface AddBlockFormProps {
  templateId: string
  onCreated: (block: WorkoutBlock) => void
  onCancel: () => void
}

function AddBlockForm({ templateId, onCreated, onCancel }: AddBlockFormProps) {
  const [name, setName] = useState(BLOCK_NAME_OPTIONS[0])
  const [custom, setCustom] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    const blockName = name === '__custom__' ? custom.trim() : name
    if (!blockName) {
      setError('Block name is required.')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const summary = await request<WorkoutBlockSummary>(
        `/v1/workout-templates/${templateId}/blocks`,
        { method: 'POST', body: JSON.stringify({ name: blockName, notes: null }) },
      )
      onCreated({ ...summary, items: [] })
    } catch {
      setError('Could not create block. Please try again.')
      setCreating(false)
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-4">
      <p className="text-sm font-medium text-zinc-700">New block</p>

      <div className="mt-3 flex flex-col gap-2">
        <select
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-700 focus:border-indigo-400 focus:outline-none"
        >
          {BLOCK_NAME_OPTIONS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
          <option value="__custom__">Custom name…</option>
        </select>

        {name === '__custom__' && (
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            maxLength={255}
            placeholder="Enter block name"
            className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-700 focus:border-indigo-400 focus:outline-none"
          />
        )}
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create block'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TemplateDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [template, setTemplate] = useState<WorkoutTemplateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [showAddBlock, setShowAddBlock] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)

  // Capture on mount so banner stays visible after the URL param is cleaned.
  const [showFromAiBanner] = useState(() => searchParams.get('fromAi') === '1')

  useEffect(() => {
    request<WorkoutTemplateDetail>(`/v1/workout-templates/${id}`)
      .then((t) => { setTemplate(t); setTitleValue(t.title) })
      .catch((err: unknown) => {
        try { handleApiError(err, router) } catch { setNotFound(true) }
      })
      .finally(() => setLoading(false))
  }, [id, router])

  // Remove the ?fromAi=1 param from history so it's a one-shot banner.
  useEffect(() => {
    if (!showFromAiBanner) return
    router.replace(pathname)
  }, [showFromAiBanner, router, pathname])

  async function handleTitleBlur() {
    const value = titleValue.trim()
    if (!value || value === template?.title) return
    setSavingTitle(true)
    try {
      await request(`/v1/workout-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: value }),
      })
      setTemplate((prev) => prev ? { ...prev, title: value } : prev)
    } catch {
      setTitleValue(template?.title ?? '')
    } finally {
      setSavingTitle(false)
    }
  }

  function handleBlockDeleted(blockId: string) {
    setTemplate((prev) =>
      prev ? { ...prev, blocks: prev.blocks.filter((b) => b.id !== blockId) } : prev,
    )
  }

  function handleBlockItemsChange(blockId: string, items: BlockItem[]) {
    setTemplate((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        blocks: prev.blocks.map((b) => (b.id === blockId ? { ...b, items } : b)),
      }
    })
  }

  function handleBlockCreated(block: WorkoutBlock) {
    setTemplate((prev) => prev ? { ...prev, blocks: [...prev.blocks, block] } : prev)
    setShowAddBlock(false)
  }

  if (loading)
    return (
      <div>
        <span className="sr-only">Loading…</span>
        <SkeletonList rows={4} />
      </div>
    )

  if (notFound || !template)
    return <p className="text-sm text-zinc-500">Template not found.</p>

  return (
    <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/templates" className="text-sm text-zinc-500 hover:text-zinc-700">
          Templates
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="text-sm text-zinc-900">{template.title}</span>
      </div>

      {/* Title row */}
      <div className="mt-4 flex items-center gap-3">
        {editMode ? (
          <input
            type="text"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleBlur}
            maxLength={255}
            className="flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xl font-semibold text-zinc-900 focus:border-indigo-400 focus:outline-none"
          />
        ) : (
          <h1 className="flex-1 text-xl font-semibold text-zinc-900">{template.title}</h1>
        )}

        {savingTitle && <span className="text-xs text-zinc-400">Saving…</span>}

        <button
          onClick={() => { setEditMode((v) => !v); setShowAddBlock(false) }}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            editMode
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          {editMode ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Done editing
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit template
            </>
          )}
        </button>
      </div>

      {template.description && !editMode && (
        <p className="mt-1 text-sm text-zinc-500">{template.description}</p>
      )}

      {/* fromAi success banner */}
      {showFromAiBanner && (
        <div
          role="status"
          aria-label="Template saved"
          className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-green-800">Template saved</p>
              <p className="mt-0.5 text-sm text-green-700">
                Next step: assign it to your athletes.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/templates"
                className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2"
              >
                Back to templates
              </Link>
              <button
                type="button"
                onClick={() =>
                  document.getElementById('assign')?.scrollIntoView({ behavior: 'smooth' })
                }
                className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
              >
                Assign now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign panel */}
      <div id="assign">
        <AssignPanel templateId={id} />
      </div>

      {/* Blocks */}
      <div className="mt-8 space-y-4">
        {editMode ? (
          <>
            {template.blocks.map((block) => (
              <BlockEditor
                key={block.id}
                block={block}
                onDeleted={handleBlockDeleted}
                onItemsChange={handleBlockItemsChange}
              />
            ))}

            {showAddBlock ? (
              <AddBlockForm
                templateId={id}
                onCreated={handleBlockCreated}
                onCancel={() => setShowAddBlock(false)}
              />
            ) : (
              <button
                onClick={() => setShowAddBlock(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 py-3 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add block
              </button>
            )}
          </>
        ) : (
          template.blocks.map((block) => (
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
                      {Object.values(item.prescription_json).some((v) => v != null) && (
                        <span className="text-xs text-zinc-400">
                          {(['sets', 'reps', 'load', 'rest'] as const)
                            .filter((k) => item.prescription_json[k] != null)
                            .map((k) => `${item.prescription_json[k]} ${k}`)
                            .join(' · ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-zinc-400">No exercises assigned.</p>
              )}
            </section>
          ))
        )}
      </div>
    </>
  )
}
