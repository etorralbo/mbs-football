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
    <div className="rounded-lg border border-dashed border-white/15 bg-[#131922] p-4">
      <p className="text-sm font-medium text-white">New block</p>

      <div className="mt-3 flex flex-col gap-2">
        <select
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-white/10 bg-[#0d1420] px-2.5 py-1.5 text-sm text-white focus:border-[#4f9cf9] focus:outline-none"
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
            className="rounded-md border border-white/10 bg-[#0d1420] px-2.5 py-1.5 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
          />
        )}
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center rounded-md bg-[#c8f135] px-3 py-1.5 text-xs font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755] disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create block'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-300"
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
  const [publishing, setPublishing] = useState(false)
  const [reorderingBlockId, setReorderingBlockId] = useState<string | null>(null)

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

  async function handlePublish() {
    if (!template || template.status === 'published') return
    // Optimistic update
    setTemplate((prev) => prev ? { ...prev, status: 'published' } : prev)
    setPublishing(true)
    try {
      await request(`/v1/workout-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'published' }),
      })
    } catch {
      // Revert on error
      setTemplate((prev) => prev ? { ...prev, status: 'draft' } : prev)
    } finally {
      setPublishing(false)
    }
  }

  async function handleReorderBlock(blockId: string, direction: 'up' | 'down') {
    if (!template) return
    const idx = template.blocks.findIndex((b) => b.id === blockId)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= template.blocks.length) return

    // Optimistic reorder
    const newBlocks = [...template.blocks]
    ;[newBlocks[idx], newBlocks[swapIdx]] = [newBlocks[swapIdx], newBlocks[idx]]
    setTemplate((prev) => prev ? { ...prev, blocks: newBlocks } : prev)
    setReorderingBlockId(blockId)

    try {
      await request(`/v1/workout-templates/${id}/blocks/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ block_ids: newBlocks.map((b) => b.id) }),
      })
    } catch {
      // Revert on error
      setTemplate((prev) =>
        prev ? { ...prev, blocks: template.blocks } : prev,
      )
    } finally {
      setReorderingBlockId(null)
    }
  }

  function handleBlockDeleted(blockId: string) {
    setTemplate((prev) =>
      prev ? { ...prev, blocks: prev.blocks.filter((b) => b.id !== blockId) } : prev,
    )
  }

  function handleBlockItemAdded(blockId: string, item: BlockItem) {
    setTemplate((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        blocks: prev.blocks.map((b) =>
          b.id === blockId ? { ...b, items: [...b.items, item] } : b,
        ),
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
    return <p className="text-sm text-slate-400">Template not found.</p>

  return (
    <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/templates" className="text-sm text-slate-400 hover:text-slate-300">
          Templates
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-sm text-white">{template.title}</span>
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
            className="flex-1 rounded-md border border-white/10 bg-[#0d1420] px-3 py-1.5 text-xl font-semibold text-white focus:border-[#4f9cf9] focus:outline-none"
          />
        ) : (
          <h1 className="flex-1 text-xl font-semibold text-white">{template.title}</h1>
        )}

        {/* Status badge */}
        {template.status === 'draft' && (
          <span className="shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-400">
            Draft
          </span>
        )}

        {savingTitle && <span className="text-xs text-slate-400">Saving…</span>}

        {/* Publish button (only when draft) */}
        {template.status === 'draft' && (
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="shrink-0 rounded-md bg-[#c8f135] px-3 py-1.5 text-xs font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755] disabled:opacity-50"
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        )}

        <button
          onClick={() => { setEditMode((v) => !v); setShowAddBlock(false) }}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            editMode
              ? 'border-[#4f9cf9]/30 bg-[#4f9cf9]/10 text-[#4f9cf9] hover:bg-[#4f9cf9]/15'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
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
        <p className="mt-1 text-sm text-slate-400">{template.description}</p>
      )}

      {/* fromAi success banner */}
      {showFromAiBanner && (
        <div
          role="status"
          aria-label="Template saved"
          className="mt-4 rounded-lg border border-emerald-800/40 bg-emerald-900/20 px-4 py-3"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-emerald-400">Template saved</p>
              <p className="mt-0.5 text-sm text-emerald-400/70">
                Next step: assign it to your athletes.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/templates"
                className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2"
              >
                Back to templates
              </Link>
              <button
                type="button"
                onClick={() =>
                  document.getElementById('assign')?.scrollIntoView({ behavior: 'smooth' })
                }
                className="inline-flex items-center rounded-md bg-[#c8f135] px-3 py-1 text-xs font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135] focus-visible:ring-offset-2"
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
            {template.blocks.map((block, idx) => (
              <div key={block.id} className="flex gap-2">
                {/* Reorder buttons */}
                <div className="flex flex-col justify-center gap-1">
                  <button
                    onClick={() => handleReorderBlock(block.id, 'up')}
                    disabled={idx === 0 || reorderingBlockId !== null}
                    aria-label={`Move ${block.name} up`}
                    className="rounded p-1 text-slate-600 transition-colors hover:bg-white/5 hover:text-slate-300 disabled:opacity-30"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleReorderBlock(block.id, 'down')}
                    disabled={idx === template.blocks.length - 1 || reorderingBlockId !== null}
                    aria-label={`Move ${block.name} down`}
                    className="rounded p-1 text-slate-600 transition-colors hover:bg-white/5 hover:text-slate-300 disabled:opacity-30"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1">
                  <BlockEditor
                    block={block}
                    onDeleted={handleBlockDeleted}
                    onItemAdded={handleBlockItemAdded}
                  />
                </div>
              </div>
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
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 py-3 text-sm text-slate-400 transition-colors hover:border-white/25 hover:text-slate-300"
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
            <section key={block.id} className="rounded-lg border border-white/8 bg-[#131922] p-5">
              <h2 className="border-l-2 border-[#c8f135] pl-3 text-sm font-semibold text-white">{block.name}</h2>
              {block.notes && (
                <p className="mt-1 text-xs text-slate-400">{block.notes}</p>
              )}
              {block.items.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {block.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#4f9cf9]" aria-hidden="true" />
                      <span className="text-sm text-white">{item.exercise.name}</span>
                      {Object.values(item.prescription_json).some((v) => v != null) && (
                        <span className="text-xs text-slate-500">
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
                <p className="mt-2 text-xs text-slate-500">No exercises assigned.</p>
              )}
            </section>
          ))
        )}
      </div>
    </>
  )
}
