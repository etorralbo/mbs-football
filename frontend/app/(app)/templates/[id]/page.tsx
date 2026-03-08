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
import { ExercisePicker } from './ExercisePicker'
import { SortableBlock } from './SortableBlock'
import { DashedActionButton } from '@/src/components/DashedActionButton'
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

// Titles that should trigger autofocus + select when entering edit mode
function isDefaultTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase()
  return !normalized || normalized === 'template' || normalized === 'untitled'
}

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
  const [titleHintVisible, setTitleHintVisible] = useState(true)
  const [assignOpen, setAssignOpen] = useState(false)
  const [pickerState, setPickerState] = useState<
    { open: false } | { open: true; blockId: string }
  >({ open: false })
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const titleInputRef = useRef<HTMLInputElement>(null)
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

  // Reset hint + conditional autofocus when entering edit mode
  useEffect(() => {
    if (!editMode) return
    setTitleHintVisible(true)
    if (isDefaultTitle(titleValue) && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode])

  // Close assign drawer on Escape
  useEffect(() => {
    if (!assignOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setAssignOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [assignOpen])

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

  function handleBlockItemUpdated(blockId: string, updatedItem: BlockItem) {
    setTemplate((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        blocks: prev.blocks.map((b) =>
          b.id === blockId
            ? { ...b, items: b.items.map((i) => (i.id === updatedItem.id ? updatedItem : i)) }
            : b,
        ),
      }
    })
  }

  function handleExercisesAdded(blockId: string, items: BlockItem[]) {
    setTemplate((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        blocks: prev.blocks.map((b) =>
          b.id === blockId ? { ...b, items: [...b.items, ...items] } : b,
        ),
      }
    })
    setPickerState({ open: false })
    // Scroll to the block so the newly added exercises are visible
    requestAnimationFrame(() => {
      document.getElementById(`block-${blockId}`)?.scrollIntoView({ behavior: 'smooth' })
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
      {/* ── Sticky header ── */}
      <div className="-mx-4 border-b border-slate-800 bg-slate-950/80 px-4 pb-3 pt-3 md:sticky md:top-0 md:z-30 md:pb-4 md:pt-4 md:backdrop-blur">
        {/* Breadcrumb */}
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/templates" className="shrink-0 text-xs text-slate-500 hover:text-slate-300">
            Templates
          </Link>
          <span className="shrink-0 text-xs text-slate-600">/</span>
          <span className="truncate text-xs text-slate-300">{template.title}</span>
        </div>

        {/* Title area */}
        <div className="mt-2 flex flex-col gap-2 md:mt-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <div className={`flex min-w-0 items-center gap-2${editMode ? ' group' : ''}`}>
              {editMode ? (
                <>
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={titleValue}
                    onChange={(e) => { setTitleValue(e.target.value); setTitleHintVisible(false) }}
                    onFocus={() => setTitleHintVisible(false)}
                    onBlur={handleTitleBlur}
                    maxLength={255}
                    className="min-w-0 flex-1 cursor-text border-b border-transparent bg-transparent p-0 text-2xl font-bold leading-tight text-white outline-none transition-colors group-hover:border-slate-600 focus:border-[#c8f135]"
                  />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 shrink-0 text-slate-500 opacity-0 transition-opacity group-hover:opacity-100"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </>
              ) : (
                <h1 className="break-words text-2xl font-bold leading-tight text-white">{template.title}</h1>
              )}
            </div>

            {/* Title hint — disappears on interaction */}
            {editMode && titleHintVisible && (
              <p className="text-xs text-slate-500">Click the title to rename</p>
            )}

            {/* Auto-save indicator (visible in edit mode) */}
            {editMode && saveStatus === 'saving' && (
              <p className="text-sm text-slate-400">
                <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-slate-400" />
                Saving…
              </p>
            )}
            {editMode && saveStatus !== 'saving' && (
              <p className="text-sm text-emerald-400/70">
                <svg xmlns="http://www.w3.org/2000/svg" className="mr-1.5 -mt-0.5 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                All changes saved
              </p>
            )}

            {!editMode && template.description && (
              <p className="text-sm text-slate-400">{template.description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 md:ml-4 md:shrink-0">
            {/* Assign button */}
            <button
              onClick={() => setAssignOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Assign
            </button>

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
              disabled={editMode && saveStatus === 'saving'}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {editMode && saveStatus === 'saving' ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-slate-300" />
                  Saving…
                </>
              ) : editMode ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Close editor
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
          <p role="alert" className="mt-3 text-sm text-red-400">
            {publishError}
          </p>
        )}

        {/* Published template warning — edit mode only */}
        {editMode && template.status === 'published' && (
          <div
            role="note"
            aria-label="Published template notice"
            className="mt-3 rounded-2xl border border-amber-800/40 bg-amber-900/20 px-5 py-3"
          >
            <p className="text-sm font-medium text-amber-400">
              This template is published.
            </p>
            <p className="mt-0.5 text-sm text-amber-400/70">
              Changes you make will only affect future assignments. Existing sessions will remain unchanged.
            </p>
          </div>
        )}

        {/* Block jump navigation chips */}
        {template.blocks.length > 0 && (
          <nav aria-label="Block navigation" className="mt-2 flex min-w-0 flex-wrap gap-2 md:mt-3">
            {template.blocks.map((block, idx) => (
              <button
                key={block.id}
                onClick={() =>
                  document.getElementById(`block-${block.id}`)?.scrollIntoView({ behavior: 'smooth' })
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: getAccentColor(idx) }}
                  aria-hidden="true"
                />
                {block.name || `Block ${idx + 1}`}
              </button>
            ))}
          </nav>
        )}
      </div>

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
                onClick={() => setAssignOpen(true)}
                className="inline-flex items-center rounded-lg bg-[#c8f135] px-3 py-1.5 text-xs font-bold text-[#0a0d14] transition-colors hover:bg-[#d4f755] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f135] focus-visible:ring-offset-2"
              >
                Assign now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign drawer */}
      {assignOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setAssignOpen(false)}
            aria-hidden="true"
          />
          {/* Panel */}
          <div
            role="dialog"
            aria-label="Assign workout"
            className="relative w-full max-w-md animate-[slideIn_200ms_ease-out] overflow-y-auto bg-slate-950 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h2 className="text-base font-bold text-white">Assign workout</h2>
              <button
                type="button"
                onClick={() => setAssignOpen(false)}
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                aria-label="Close assign panel"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <AssignPanel templateId={id} />
            </div>
          </div>
        </div>
      )}

      {/* Exercise picker drawer */}
      {pickerState.open && (
        <ExercisePicker
          blockId={pickerState.blockId}
          onClose={() => setPickerState({ open: false })}
          onExercisesAdded={handleExercisesAdded}
        />
      )}

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
                  <div key={block.id} id={`block-${block.id}`} className="scroll-mt-48">
                    <SortableBlock
                      id={block.id}
                      block={block}
                      accentColor={getAccentColor(idx)}
                      onDeleted={handleBlockDeleted}
                      onItemUpdated={handleBlockItemUpdated}
                      onBrowseLibrary={() => { setAssignOpen(false); setPickerState({ open: true, blockId: block.id }) }}
                      onSaving={markSaving}
                      onSaved={markSaved}
                    />
                  </div>
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
              <DashedActionButton size="lg" onClick={() => setShowAddBlock(true)}>
                Add new block
              </DashedActionButton>
            )}
          </>
        ) : (
          template.blocks.map((block, idx) => (
            <section
              key={block.id}
              id={`block-${block.id}`}
              className="scroll-mt-48 overflow-hidden rounded-2xl border border-slate-800 bg-[#121d28] shadow-xl"
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
                            <div className="mt-2 space-y-2">
                              {item.sets.map((s, sIdx) => (
                                <div key={s.order} className="flex items-end gap-3">
                                  <span className="mb-1.5 text-xs font-bold text-slate-600">{sIdx + 1}</span>
                                  <div className="grid flex-1 grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                      {sIdx === 0 && (
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Reps</span>
                                      )}
                                      <div className="rounded-lg border border-slate-800/50 bg-[#1a2938]/60 px-3 py-1.5 text-center text-sm font-semibold text-white">
                                        {s.reps ?? '—'}
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      {sIdx === 0 && (
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">kg</span>
                                      )}
                                      <div className="rounded-lg border border-slate-800/50 bg-[#1a2938]/60 px-3 py-1.5 text-center text-sm font-semibold text-white">
                                        {s.weight ?? '—'}
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      {sIdx === 0 && (
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">RPE</span>
                                      )}
                                      <div className="rounded-lg border border-slate-800/50 bg-[#1a2938]/60 px-3 py-1.5 text-center text-sm font-semibold text-white">
                                        {s.rpe ?? '—'}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
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
