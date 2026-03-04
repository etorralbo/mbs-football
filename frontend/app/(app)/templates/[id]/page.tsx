'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { request, ValidationError } from '@/app/_shared/api/httpClient'
import { handleApiError } from '@/app/_shared/api/handleApiError'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { AssignPanel } from './AssignPanel'
import { SortableBlock } from './SortableBlock'
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

// Accent colors cycled per block index
const BLOCK_ACCENT_COLORS = ['#facc15', '#ef4444', '#22c55e', '#3b82f6']

function getAccentColor(index: number) {
  return BLOCK_ACCENT_COLORS[index % BLOCK_ACCENT_COLORS.length]
}

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
    <div className="rounded-2xl border border-dashed border-slate-700 bg-[#121d28] p-5">
      <p className="text-sm font-bold text-white">New block</p>

      <div className="mt-3 flex flex-col gap-2">
        <select
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-slate-800 bg-[#1a2938] px-3 py-2 text-sm text-white focus:border-[#137fec] focus:outline-none"
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
            className="rounded-lg border border-slate-800 bg-[#1a2938] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#137fec] focus:outline-none"
          />
        )}
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center rounded-lg bg-[#c8f135] px-4 py-2 text-sm font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755] disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create block'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-300"
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
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const savingCountRef = useRef(0)

  const markSaving = useCallback(() => {
    savingCountRef.current += 1
    clearTimeout(saveTimerRef.current)
    setSaveStatus('saving')
  }, [])

  const markSaved = useCallback(() => {
    savingCountRef.current = Math.max(0, savingCountRef.current - 1)
    if (savingCountRef.current === 0) {
      setSaveStatus('saved')
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

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
    markSaving()
    try {
      await request(`/v1/workout-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: value }),
      })
      setTemplate((prev) => prev ? { ...prev, title: value } : prev)
    } catch {
      setTitleValue(template?.title ?? '')
    } finally {
      markSaved()
    }
  }

  async function handleToggleStatus() {
    if (!template) return
    const newStatus = template.status === 'draft' ? 'published' : 'draft'
    const previousStatus = template.status
    setPublishError(null)
    setTemplate((prev) => prev ? { ...prev, status: newStatus } : prev)
    setPublishing(true)
    try {
      await request(`/v1/workout-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
    } catch (err) {
      setTemplate((prev) => prev ? { ...prev, status: previousStatus } : prev)
      if (err instanceof ValidationError && typeof err.detail === 'string') {
        setPublishError(err.detail)
      } else {
        setPublishError(`Could not ${newStatus === 'published' ? 'publish' : 'unpublish'} template. Please try again.`)
      }
    } finally {
      setPublishing(false)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !template) return

    const oldIndex = template.blocks.findIndex((b) => b.id === active.id)
    const newIndex = template.blocks.findIndex((b) => b.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const newBlocks = arrayMove(template.blocks, oldIndex, newIndex)
    const previousBlocks = template.blocks
    setTemplate((prev) => prev ? { ...prev, blocks: newBlocks } : prev)
    markSaving()

    try {
      await request(`/v1/workout-templates/${id}/blocks/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ block_ids: newBlocks.map((b) => b.id) }),
      })
    } catch {
      setTemplate((prev) =>
        prev ? { ...prev, blocks: previousBlocks } : prev,
      )
    } finally {
      markSaved()
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
    <div className="mx-auto max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/templates" className="text-xs text-slate-500 hover:text-slate-300">
          Templates
        </Link>
        <span className="text-xs text-slate-600">/</span>
        <span className="text-xs text-slate-300">{template.title}</span>
      </div>

      {/* Title area */}
      <div className="mt-4 flex items-end justify-between border-b border-slate-800 pb-6">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            {editMode ? (
              <input
                type="text"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleBlur}
                maxLength={255}
                className="flex-1 rounded-lg border border-slate-800 bg-[#1a2938] px-3 py-2 text-3xl font-bold text-white focus:border-[#137fec] focus:outline-none"
              />
            ) : (
              <h1 className="text-3xl font-bold text-white">{template.title}</h1>
            )}

          </div>

          {/* Auto-save indicator (visible in edit mode) */}
          {editMode && saveStatus === 'saving' && (
            <p className="text-xs text-slate-400">Saving…</p>
          )}
          {editMode && saveStatus === 'saved' && (
            <p className="text-xs text-emerald-400">Changes saved automatically</p>
          )}

          {template.description && (
            <p className="text-sm text-slate-400">{template.description}</p>
          )}
        </div>

        <div className="ml-4 flex shrink-0 items-center gap-3">
          {/* Status toggle */}
          <button
            onClick={handleToggleStatus}
            disabled={publishing}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors disabled:opacity-50 ${
              template.status === 'draft'
                ? 'bg-[#c8f135] text-[#0a0d14] hover:bg-[#d4f755]'
                : 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {publishing
              ? (template.status === 'published' ? 'Publishing…' : 'Unpublishing…')
              : (template.status === 'draft' ? 'Publish' : 'Convert to draft')}
          </button>

          <button
            onClick={() => { setEditMode((v) => !v); setShowAddBlock(false) }}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              editMode
                ? 'border-[#137fec]/30 bg-[#137fec]/10 text-[#137fec] hover:bg-[#137fec]/15'
                : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {editMode ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Done editing
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit template
              </>
            )}
          </button>
        </div>
      </div>

      {/* Publish error */}
      {publishError && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {publishError}
        </p>
      )}

      {/* Published template warning — edit mode only */}
      {editMode && template.status === 'published' && (
        <div
          role="note"
          aria-label="Published template notice"
          className="mt-4 rounded-2xl border border-amber-800/40 bg-amber-900/20 px-5 py-4"
        >
          <p className="text-sm font-medium text-amber-400">
            This template is already used in athlete sessions.
          </p>
          <p className="mt-0.5 text-sm text-amber-400/70">
            Changes you make will only affect future assignments. Existing sessions will remain unchanged.
          </p>
        </div>
      )}

      {/* fromAi success banner */}
      {showFromAiBanner && (
        <div
          role="status"
          aria-label="Template saved"
          className="mt-6 rounded-2xl border border-emerald-800/40 bg-emerald-900/20 px-5 py-4"
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
                className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2"
              >
                Back to templates
              </Link>
              <button
                type="button"
                onClick={() =>
                  document.getElementById('assign')?.scrollIntoView({ behavior: 'smooth' })
                }
                className="inline-flex items-center rounded-lg bg-[#c8f135] px-3 py-1.5 text-xs font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135] focus-visible:ring-offset-2"
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
      <div className="mt-8 space-y-8">
        {editMode ? (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={template.blocks.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                {template.blocks.map((block, idx) => (
                  <SortableBlock
                    key={block.id}
                    id={block.id}
                    block={block}
                    accentColor={getAccentColor(idx)}
                    onDeleted={handleBlockDeleted}
                    onItemAdded={handleBlockItemAdded}
                    onSaving={markSaving}
                    onSaved={markSaved}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {showAddBlock ? (
              <AddBlockForm
                templateId={id}
                onCreated={handleBlockCreated}
                onCancel={() => setShowAddBlock(false)}
              />
            ) : (
              <button
                onClick={() => setShowAddBlock(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-800 py-4 text-sm font-medium text-slate-500 transition-all hover:border-slate-700 hover:bg-slate-900/40 hover:text-slate-400"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Add new block
              </button>
            )}
          </>
        ) : (
          template.blocks.map((block, idx) => (
            <section
              key={block.id}
              className="overflow-hidden rounded-2xl border border-slate-800 bg-[#121d28] shadow-xl"
              style={{ borderLeftWidth: '4px', borderLeftColor: getAccentColor(idx) }}
            >
              <div className="border-b border-slate-800/50 p-5">
                <h2 className="text-lg font-bold text-white">{block.name}</h2>
                {block.notes && (
                  <p className="mt-0.5 text-xs text-slate-500">{block.notes}</p>
                )}
              </div>
              <div className="p-5">
                {block.items.length > 0 ? (
                  <div className="space-y-4">
                    {block.items.map((item) => (
                      <div key={item.id} className="flex items-start gap-4">
                        <div className="flex-1">
                          <h4 className="flex items-center gap-2 text-sm font-bold text-white">
                            <span className="h-2 w-2 shrink-0 rounded-full bg-[#137fec]" aria-hidden="true" />
                            {item.exercise.name}
                          </h4>
                          {item.sets.length > 0 && (
                            <div className="mt-2 grid grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Reps</span>
                                <div className="rounded-lg border border-slate-800/50 bg-[#1a2938]/60 px-3 py-1.5 text-center text-sm font-semibold text-white">
                                  {item.sets[0].reps ?? '—'}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">kg</span>
                                <div className="rounded-lg border border-slate-800/50 bg-[#1a2938]/60 px-3 py-1.5 text-center text-sm font-semibold text-white">
                                  {item.sets[0].weight ?? '—'}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">RPE</span>
                                <div className="rounded-lg border border-slate-800/50 bg-[#1a2938]/60 px-3 py-1.5 text-center text-sm font-semibold text-white">
                                  {item.sets[0].rpe ?? '—'}
                                </div>
                              </div>
                            </div>
                          )}
                          {item.sets.length > 1 && (
                            <p className="mt-1 text-[10px] text-slate-500">
                              +{item.sets.length - 1} more {item.sets.length - 1 === 1 ? 'set' : 'sets'}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No exercises assigned.</p>
                )}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
