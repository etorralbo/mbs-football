'use client'

import { useRef, useState } from 'react'
import { NotFoundError, request } from '@/app/_shared/api/httpClient'
import type { BlockItem, Exercise, SetPrescription, WorkoutBlock } from '@/app/_shared/api/types'
import { ExercisePicker } from './ExercisePicker'

// ---------------------------------------------------------------------------
// SetTable — per-set row editor for one exercise item
// ---------------------------------------------------------------------------

interface SetTableProps {
  item: BlockItem
  onDeleted: (itemId: string) => void
}

function SetTable({ item, onDeleted }: SetTableProps) {
  const [sets, setSets] = useState<SetPrescription[]>(item.sets)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveSets(newSets: SetPrescription[]) {
    setSaving(true)
    setError(null)
    const prev = sets
    setSets(newSets)
    try {
      await request(`/v1/block-items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sets: newSets }),
      })
    } catch (err) {
      // Item was deleted server-side (e.g. its exercise was removed from the library).
      if (err instanceof NotFoundError) {
        onDeleted(item.id)
        return
      }
      setSets(prev)
      setError('Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  function handleCellBlur(
    setIdx: number,
    field: 'reps' | 'weight' | 'rpe',
    raw: string,
  ) {
    const value = raw === '' ? null : Number(raw)
    const newSets = sets.map((s, i) =>
      i === setIdx ? { ...s, [field]: value } : s,
    )
    saveSets(newSets)
  }

  function addSet() {
    saveSets([...sets, { order: sets.length, reps: null, weight: null, rpe: null }])
  }

  function deleteSet(setIdx: number) {
    saveSets(
      sets
        .filter((_, i) => i !== setIdx)
        .map((s, i) => ({ ...s, order: i })),
    )
  }

  async function handleDeleteItem() {
    setDeleting(true)
    setError(null)
    try {
      await request(`/v1/block-items/${item.id}`, { method: 'DELETE' })
      onDeleted(item.id)
    } catch (err) {
      // Already gone — remove from UI silently.
      if (err instanceof NotFoundError) {
        onDeleted(item.id)
        return
      }
      setError('Failed to delete.')
      setDeleting(false)
    }
  }

  return (
    <li className="border-b border-white/8 py-3 last:border-0">
      {/* Exercise name row */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4f9cf9]" aria-hidden="true" />
          <span className="text-sm font-medium text-white">{item.exercise.name}</span>
          {saving && <span className="text-xs text-slate-500">Saving…</span>}
        </div>
        <button
          onClick={handleDeleteItem}
          disabled={deleting}
          aria-label={`Remove ${item.exercise.name}`}
          className="shrink-0 rounded p-1 text-slate-600 transition-colors hover:bg-red-900/30 hover:text-red-400 disabled:opacity-40"
        >
          {deleting ? '…' : '×'}
        </button>
      </div>

      {/* Sets table */}
      <table className="w-full table-fixed text-xs" aria-label={`Sets for ${item.exercise.name}`}>
        <thead>
          <tr className="text-slate-500">
            <th className="w-8 pb-1 text-center font-normal">#</th>
            <th className="pb-1 text-center font-normal">Reps</th>
            <th className="pb-1 text-center font-normal">kg</th>
            <th className="pb-1 text-center font-normal">RPE</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {sets.map((s, idx) => (
            <tr key={idx}>
              <td className="py-0.5 text-center text-slate-500">{idx + 1}</td>
              {(['reps', 'weight', 'rpe'] as const).map((field) => (
                <td key={field} className="px-1 py-0.5">
                  <input
                    type="number"
                    min={field === 'reps' ? '1' : '0'}
                    defaultValue={s[field] != null ? String(s[field]) : ''}
                    onBlur={(e) => handleCellBlur(idx, field, e.target.value)}
                    aria-label={`Set ${idx + 1} ${field} for ${item.exercise.name}`}
                    className="w-full rounded border border-white/10 bg-[#0d1420] px-1 py-0.5 text-center text-xs text-white focus:border-[#4f9cf9] focus:outline-none"
                    placeholder="—"
                  />
                </td>
              ))}
              <td className="py-0.5 text-center">
                <button
                  onClick={() => deleteSet(idx)}
                  disabled={saving || sets.length <= 1}
                  aria-label={`Delete set ${idx + 1}`}
                  className="rounded p-0.5 text-slate-600 transition-colors hover:text-red-400 disabled:opacity-20"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={addSet}
        disabled={saving}
        className="mt-1.5 flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-300 disabled:opacity-40"
        aria-label={`Add set to ${item.exercise.name}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add set
      </button>

      {error && <p role="alert" className="mt-1 text-xs text-red-400">{error}</p>}
    </li>
  )
}

// ---------------------------------------------------------------------------
// BlockEditor — one block with editable name, notes, and items
// ---------------------------------------------------------------------------

export interface BlockEditorProps {
  block: WorkoutBlock
  onDeleted: (blockId: string) => void
  onItemAdded: (blockId: string, item: BlockItem) => void
}

export function BlockEditor({ block, onDeleted, onItemAdded }: BlockEditorProps) {
  const [items, setItems] = useState<BlockItem[]>(block.items)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  async function handleNameBlur() {
    const value = nameRef.current?.value.trim() ?? ''
    if (!value) {
      if (nameRef.current) nameRef.current.value = block.name
      return
    }
    if (value === block.name) return
    try {
      await request(`/v1/blocks/${block.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: value }),
      })
    } catch {
      if (nameRef.current) nameRef.current.value = block.name
    }
  }

  async function handleNotesBlur() {
    const value = notesRef.current?.value ?? ''
    if (value === (block.notes ?? '')) return
    try {
      await request(`/v1/blocks/${block.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: value || null }),
      })
    } catch {
      if (notesRef.current) notesRef.current.value = block.notes ?? ''
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
    setItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  function handlePickerSelect(_exercise: Exercise, item: BlockItem) {
    setItems((prev) => [...prev, item])
    onItemAdded(block.id, item)
  }

  return (
    <>
      <section
        aria-label={`Edit block: ${block.name}`}
        className="rounded-lg border border-white/8 bg-[#131922] p-5"
      >
        {/* Block header row */}
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-1.5">
            <input
              ref={nameRef}
              type="text"
              defaultValue={block.name}
              onBlur={handleNameBlur}
              maxLength={255}
              placeholder="Block name"
              className="w-full rounded-md border border-white/10 bg-[#0d1420] px-2.5 py-1.5 text-sm font-semibold text-white focus:border-[#4f9cf9] focus:outline-none"
            />
            <textarea
              ref={notesRef}
              defaultValue={block.notes ?? ''}
              onBlur={handleNotesBlur}
              rows={1}
              placeholder="Notes (optional)"
              className="w-full resize-none rounded-md border border-white/10 bg-[#0d1420] px-2.5 py-1.5 text-xs text-slate-400 placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none"
            />
          </div>
          <button
            onClick={handleDeleteBlock}
            disabled={deleting}
            aria-label={`Delete block ${block.name}`}
            className="mt-0.5 shrink-0 rounded p-1.5 text-slate-600 transition-colors hover:bg-red-900/30 hover:text-red-400 disabled:opacity-40"
          >
            {deleting ? '…' : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        </div>

        {deleteError && (
          <p role="alert" className="mt-1 text-xs text-red-400">{deleteError}</p>
        )}

        {/* Exercise items with per-set table */}
        {items.length > 0 ? (
          <ul className="mt-3">
            {items.map((item) => (
              <SetTable
                key={item.id}
                item={item}
                onDeleted={handleItemDeleted}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-500">No exercises yet.</p>
        )}

        {/* Browse library button */}
        <button
          onClick={() => setPickerOpen(true)}
          className="mt-3 flex items-center gap-1.5 rounded-md border border-dashed border-white/15 px-3 py-2 text-sm text-slate-400 transition-colors hover:border-white/25 hover:text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Browse library
        </button>
      </section>

      {/* ExercisePicker modal — rendered outside the block card so it's full-screen */}
      {pickerOpen && (
        <ExercisePicker
          blockId={block.id}
          onSelect={handlePickerSelect}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}
