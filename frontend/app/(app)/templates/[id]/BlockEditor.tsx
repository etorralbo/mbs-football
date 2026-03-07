'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { NotFoundError, request } from '@/app/_shared/api/httpClient'
import type { BlockItem, SetPrescription, WorkoutBlock } from '@/app/_shared/api/types'
import { DashedActionButton } from '@/src/components/DashedActionButton'

// ---------------------------------------------------------------------------
// Local type — SetPrescription augmented with a stable client-side ID.
// _cid is never sent to the backend; it exists solely so React rows have a
// stable key that survives order renumbering after deletion.
// ---------------------------------------------------------------------------

type SetWithId = SetPrescription & { _cid: string }

function withId(s: SetPrescription): SetWithId {
  return { ...s, _cid: crypto.randomUUID() }
}

// ---------------------------------------------------------------------------
// SetTable — per-set grid editor for one exercise item
// ---------------------------------------------------------------------------

interface SetTableProps {
  item: BlockItem
  onDeleted: (itemId: string) => void
  onItemUpdated: (item: BlockItem) => void
}

function SetTable({ item, onDeleted, onItemUpdated }: SetTableProps) {
  const [sets, setSetsState] = useState<SetWithId[]>(() => item.sets.map(withId))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // latestSetsRef always holds the current sets value synchronously,
  // eliminating the stale-closure problem in concurrent blur handlers.
  const latestSetsRef = useRef<SetWithId[]>(item.sets.map(withId))

  // Abort controller for cancelling an in-flight PATCH when a newer edit arrives.
  const saveAbortRef = useRef<AbortController | null>(null)

  // Flag set as soon as item deletion starts — prevents blur events from
  // firing a PATCH after the item is already being removed.
  const itemDeletedRef = useRef(false)

  function setSets(newSets: SetWithId[]) {
    latestSetsRef.current = newSets
    setSetsState(newSets)
  }

  async function persistSets(newSets: SetWithId[]) {
    // Cancel any previous in-flight PATCH — only the latest edit matters.
    saveAbortRef.current?.abort()
    const ac = new AbortController()
    saveAbortRef.current = ac

    setSaving(true)
    setError(null)
    try {
      const result = await request<BlockItem>(
        `/v1/block-items/${item.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ sets: newSets.map(({ _cid, ...s }) => s) }),
          signal: ac.signal,
        },
      )
      if (ac.signal.aborted) return

      // Rehidrate from the server response, preserving _cid values by matching order.
      const cidByOrder = new Map(latestSetsRef.current.map((s) => [s.order, s._cid]))
      setSets(
        result.sets.map((s) => ({
          ...s,
          _cid: cidByOrder.get(s.order) ?? crypto.randomUUID(),
        })),
      )
      onItemUpdated(result)
    } catch (err) {
      if (ac.signal.aborted) return
      if (err instanceof NotFoundError) {
        onDeleted(item.id)
        return
      }
      setError('Failed to save.')
    } finally {
      if (!ac.signal.aborted) setSaving(false)
    }
  }

  function handleCellBlur(
    setIdx: number,
    field: 'reps' | 'weight' | 'rpe',
    raw: string,
  ) {
    if (itemDeletedRef.current) return
    const value = raw === '' ? null : Number(raw)
    // Read from latestSetsRef to avoid stale closure — avoids losing concurrent edits.
    const newSets = latestSetsRef.current.map((s, i) =>
      i === setIdx ? { ...s, [field]: value } : s,
    )
    setSets(newSets)
    persistSets(newSets)
  }

  function addSet() {
    const newSets: SetWithId[] = [
      ...latestSetsRef.current,
      { order: latestSetsRef.current.length, reps: null, weight: null, rpe: null, _cid: crypto.randomUUID() },
    ]
    setSets(newSets)
    persistSets(newSets)
  }

  function deleteSet(setIdx: number) {
    const newSets = latestSetsRef.current
      .filter((_, i) => i !== setIdx)
      .map((s, i) => ({ ...s, order: i }))
    setSets(newSets)
    persistSets(newSets)
  }

  async function handleDeleteItem() {
    // Raise the flag first so any concurrent blur PATCH is skipped.
    itemDeletedRef.current = true
    // Cancel any in-flight PATCH — no point saving an item we're about to delete.
    saveAbortRef.current?.abort()
    setDeleting(true)
    setError(null)
    try {
      await request(`/v1/block-items/${item.id}`, { method: 'DELETE' })
      onDeleted(item.id)
    } catch (err) {
      // Already gone (idempotent 404 → treat as success).
      if (err instanceof NotFoundError) {
        onDeleted(item.id)
        return
      }
      itemDeletedRef.current = false
      setError('Failed to delete.')
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-lg py-4 transition-all duration-150 ease-out first:pt-0 last:pb-0 hover:-translate-y-[1px] hover:bg-white/[0.02]">
      {/* Exercise name row */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-bold text-white">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#137fec]" aria-hidden="true" />
          {item.exercise.name}
          {saving && <span className="text-xs font-normal text-slate-500">Saving…</span>}
        </h4>
        <button
          onClick={handleDeleteItem}
          disabled={deleting}
          aria-label={`Remove ${item.exercise.name}`}
          className="shrink-0 rounded p-1 text-slate-600 transition-colors hover:text-slate-400"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Sets as grid cards */}
      <div className="space-y-3">
        {sets.map((s, idx) => (
          <div key={s._cid} className="flex items-end gap-3">
            {/* Set number */}
            <span className="mb-2 text-xs font-bold text-slate-600">{idx + 1}</span>

            <div className="grid flex-1 grid-cols-3 gap-3">
              {/* Reps */}
              <div className="space-y-1.5">
                {idx === 0 && (
                  <div className="flex items-center gap-1.5 px-1">
                    <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 14.652" />
                    </svg>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Reps</span>
                  </div>
                )}
                <div className="rounded-lg border border-slate-800/50 bg-[#1a2938]/60 p-2">
                  <input
                    type="number"
                    min="1"
                    defaultValue={s.reps != null ? String(s.reps) : ''}
                    onBlur={(e) => handleCellBlur(idx, 'reps', e.target.value)}
                    aria-label={`Set ${idx + 1} reps for ${item.exercise.name}`}
                    className="w-full border-none bg-transparent p-0 text-center text-sm font-semibold text-white focus:ring-0"
                    placeholder="—"
                  />
                </div>
              </div>

              {/* Weight */}
              <div className="space-y-1.5">
                {idx === 0 && (
                  <div className="flex items-center gap-1.5 px-1">
                    <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.97zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.97z" />
                    </svg>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">kg</span>
                  </div>
                )}
                <div className="rounded-lg border border-slate-800/50 bg-[#1a2938]/60 p-2">
                  <input
                    type="number"
                    min="0"
                    defaultValue={s.weight != null ? String(s.weight) : ''}
                    onBlur={(e) => handleCellBlur(idx, 'weight', e.target.value)}
                    aria-label={`Set ${idx + 1} weight for ${item.exercise.name}`}
                    className="w-full border-none bg-transparent p-0 text-center text-sm font-semibold text-white focus:ring-0"
                    placeholder="--"
                  />
                </div>
              </div>

              {/* RPE */}
              <div className="space-y-1.5">
                {idx === 0 && (
                  <div className="flex items-center gap-1.5 px-1">
                    <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">RPE</span>
                  </div>
                )}
                <div className="rounded-lg border border-slate-800/50 bg-[#1a2938]/60 p-2">
                  <input
                    type="number"
                    min="0"
                    defaultValue={s.rpe != null ? String(s.rpe) : ''}
                    onBlur={(e) => handleCellBlur(idx, 'rpe', e.target.value)}
                    aria-label={`Set ${idx + 1} rpe for ${item.exercise.name}`}
                    className="w-full border-none bg-transparent p-0 text-center text-sm font-semibold text-white focus:ring-0"
                    placeholder="—"
                  />
                </div>
              </div>
            </div>

            {/* Delete set */}
            <button
              onClick={() => deleteSet(idx)}
              disabled={saving || sets.length <= 1}
              aria-label={`Delete set ${idx + 1}`}
              className="mb-2 rounded p-0.5 text-slate-700 transition-colors hover:text-red-400 disabled:opacity-20"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <DashedActionButton
        size="sm"
        onClick={addSet}
        disabled={saving}
        aria-label={`Add set to ${item.exercise.name}`}
        className="mt-4 px-4 py-2"
      >
        Add set
      </DashedActionButton>

      {error && <p role="alert" className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// BlockEditor — one block with editable name, notes, and items
// ---------------------------------------------------------------------------

export interface BlockEditorProps {
  block: WorkoutBlock
  accentColor?: string
  onDeleted: (blockId: string) => void
  onItemUpdated: (blockId: string, item: BlockItem) => void
  onBrowseLibrary?: () => void
  onSaving?: () => void
  onSaved?: () => void
}

export function BlockEditor({ block, accentColor = '#facc15', onDeleted, onItemUpdated, onBrowseLibrary, onSaving, onSaved }: BlockEditorProps) {
  // Derived items: parent's block.items minus locally deleted items.
  // Local state is authoritative for deletions; parent is authoritative for
  // additions (e.g. via the page-level exercise picker drawer).
  // Existing items are NOT updated from parent — this avoids reverting
  // in-flight set edits while the editor is mounted.
  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set())
  const items = useMemo(
    () => block.items.filter((i) => !deletedItemIds.has(i.id)),
    [block.items, deletedItemIds],
  )

  // Track IDs seen so far so newly added items can be briefly highlighted.
  // We store both knownIds and highlightedIds in a single ref to avoid
  // calling setState during render or directly inside an effect body.
  const highlightRef = useRef<{
    known: Set<string>
    timers: Map<string, ReturnType<typeof setTimeout>>
  }>({
    known: new Set(block.items.map((i) => i.id)),
    timers: new Map(),
  })
  const [highlightedItemIds, setHighlightedItemIds] = useState<Set<string>>(new Set())

  // Detect newly added items from parent and schedule highlight-then-fade.
  // setState is deferred via setTimeout to satisfy the react-hooks/set-state-in-effect rule.
  useEffect(() => {
    const { known, timers } = highlightRef.current
    const newIds: string[] = []
    for (const item of block.items) {
      if (!known.has(item.id)) {
        known.add(item.id)
        newIds.push(item.id)
      }
    }
    if (newIds.length === 0) return

    // Deferred so the setState is not synchronous inside the effect body.
    const addTimer = setTimeout(() => {
      setHighlightedItemIds((prev) => new Set([...prev, ...newIds]))
    }, 0)

    for (const id of newIds) {
      const existing = timers.get(id)
      if (existing) clearTimeout(existing)
      timers.set(
        id,
        setTimeout(() => {
          setHighlightedItemIds((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
          timers.delete(id)
        }, 2000),
      )
    }

    return () => clearTimeout(addTimer)
  }, [block.items])

  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  async function handleNameBlur() {
    const value = nameRef.current?.value.trim() ?? ''
    if (!value) {
      if (nameRef.current) nameRef.current.value = block.name
      return
    }
    if (value === block.name) return
    onSaving?.()
    try {
      await request(`/v1/blocks/${block.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: value }),
      })
      onSaved?.()
    } catch {
      if (nameRef.current) nameRef.current.value = block.name
      onSaved?.()
    }
  }

  async function handleNotesBlur() {
    const value = notesRef.current?.value ?? ''
    if (value === (block.notes ?? '')) return
    onSaving?.()
    try {
      await request(`/v1/blocks/${block.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: value || null }),
      })
      onSaved?.()
    } catch {
      if (notesRef.current) notesRef.current.value = block.notes ?? ''
      onSaved?.()
    }
  }

  async function handleDeleteBlock() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await request(`/v1/blocks/${block.id}`, { method: 'DELETE' })
      onDeleted(block.id)
    } catch {
      setDeleteError('Failed to delete block.')
      setDeleting(false)
    }
  }

  function handleItemDeleted(itemId: string) {
    setDeletedItemIds((prev) => new Set([...prev, itemId]))
  }

  return (
    <section
        aria-label={`Edit block: ${block.name}`}
        className="overflow-hidden rounded-2xl border border-slate-800 bg-[#121d28] shadow-xl"
        style={{ borderLeftWidth: '4px', borderLeftColor: accentColor }}
      >
        {/* Block header */}
        <div className="flex items-start justify-between border-b border-slate-800/50 p-5">
          <div className="flex-1 space-y-1.5">
            <input
              ref={nameRef}
              type="text"
              defaultValue={block.name}
              onBlur={handleNameBlur}
              maxLength={255}
              placeholder="Block name"
              className="w-full rounded-lg border border-slate-800 bg-[#1a2938] px-3 py-2 text-lg font-bold text-white focus:border-[#137fec] focus:outline-none"
            />
            <textarea
              ref={notesRef}
              defaultValue={block.notes ?? ''}
              onBlur={handleNotesBlur}
              rows={1}
              placeholder="Notes (optional)"
              className="w-full resize-none rounded-lg border border-slate-800 bg-[#1a2938] px-3 py-1.5 text-xs text-slate-400 placeholder:text-slate-600 focus:border-[#137fec] focus:outline-none"
            />
          </div>
          <button
            onClick={handleDeleteBlock}
            disabled={deleting}
            aria-label={`Delete block ${block.name}`}
            className="ml-3 mt-1 shrink-0 rounded p-2 text-slate-500 transition-colors hover:text-red-400"
          >
            {deleting ? '…' : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        </div>

        {deleteError && (
          <p role="alert" className="px-5 pt-2 text-xs text-red-400">{deleteError}</p>
        )}

        {/* Exercise items */}
        <div className="p-5">
          {items.length > 0 ? (
            <div className="divide-y divide-slate-800/50">
              {items.map((item) => (
                <div key={item.id} data-highlight={highlightedItemIds.has(item.id) ? 'true' : undefined}>
                  <SetTable
                    item={item}
                    onDeleted={handleItemDeleted}
                    onItemUpdated={(updated) => onItemUpdated(block.id, updated)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-1 text-xs text-slate-500">Add your first exercise to this block</p>
          )}

          {/* Add exercise button */}
          <DashedActionButton size="md" onClick={onBrowseLibrary} className="mt-4">
            Add exercise
          </DashedActionButton>
        </div>
    </section>
  )
}
