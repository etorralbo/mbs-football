'use client'

import { useRef, useState } from 'react'
import { request } from '@/app/_shared/api/httpClient'
import type { BlockItem, WorkoutBlock } from '@/app/_shared/api/types'
import { ExerciseSearch, type AddedItem } from './ExerciseSearch'

// Prescription fields shown in the editor, matching what athletes see.
const PRESCRIPTION_FIELDS = [
  { key: 'sets',   label: 'Sets' },
  { key: 'reps',   label: 'Reps' },
  { key: 'weight', label: 'kg'   },
  { key: 'rpe',    label: 'RPE'  },
  { key: 'rest',   label: 'Rest' },
] as const

type PrescriptionKey = (typeof PRESCRIPTION_FIELDS)[number]['key']

// ---------------------------------------------------------------------------
// ItemRow — one exercise with prescription inputs
// ---------------------------------------------------------------------------

interface ItemRowProps {
  item: BlockItem
  onDeleted: (itemId: string) => void
}

function ItemRow({ item, onDeleted }: ItemRowProps) {
  const [prescription, setPrescription] = useState<Record<string, unknown>>(
    item.prescription_json,
  )
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePrescriptionBlur(key: PrescriptionKey, raw: string) {
    const value = raw === '' ? undefined : Number(raw)
    const updated = { ...prescription, [key]: value }
    setPrescription(updated)
    try {
      await request(`/v1/block-items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ prescription_json: updated }),
      })
    } catch {
      setError('Failed to save.')
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await request(`/v1/block-items/${item.id}`, { method: 'DELETE' })
      onDeleted(item.id)
    } catch {
      setError('Failed to delete.')
      setDeleting(false)
    }
  }

  return (
    <li className="flex items-center gap-3 border-b border-white/8 py-2 last:border-0">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4f9cf9]" aria-hidden="true" />

      <span className="min-w-0 flex-1 truncate text-sm text-white">
        {item.exercise.name}
      </span>

      {/* Prescription mini-inputs */}
      <div className="flex shrink-0 items-end gap-2">
        {PRESCRIPTION_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex flex-col items-center gap-0.5">
            <input
              type="number"
              min="0"
              defaultValue={
                prescription[key] != null ? String(prescription[key]) : ''
              }
              onBlur={(e) => handlePrescriptionBlur(key, e.target.value)}
              aria-label={`${item.exercise.name} ${label}`}
              className="w-12 rounded border border-white/10 bg-[#0d1420] px-1 py-0.5 text-center text-xs text-white focus:border-[#4f9cf9] focus:outline-none"
              placeholder="—"
            />
            <span className="text-xs text-slate-500">{label}</span>
          </div>
        ))}
      </div>

      {error && <span className="text-xs text-red-400">{error}</span>}

      <button
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Remove ${item.exercise.name}`}
        className="shrink-0 rounded p-1 text-slate-600 transition-colors hover:bg-red-900/30 hover:text-red-400 disabled:opacity-40"
      >
        {deleting ? '…' : '×'}
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// BlockEditor — one block with editable name, notes, and items
// ---------------------------------------------------------------------------

export interface BlockEditorProps {
  block: WorkoutBlock
  onDeleted: (blockId: string) => void
  onItemsChange: (blockId: string, items: BlockItem[]) => void
}

export function BlockEditor({ block, onDeleted, onItemsChange }: BlockEditorProps) {
  const [items, setItems] = useState<BlockItem[]>(block.items)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  async function handleNameBlur() {
    const value = nameRef.current?.value.trim() ?? ''
    if (!value) {
      // Restore to original — don't persist an empty name (validates on backend too)
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
    const updated = items.filter((i) => i.id !== itemId)
    setItems(updated)
    onItemsChange(block.id, updated)
  }

  function handleItemAdded(added: AddedItem) {
    // AddedItem is compatible with BlockItem (same shape)
    const asItem: BlockItem = {
      id: added.id,
      workout_block_id: added.workout_block_id,
      order: added.order,
      prescription_json: added.prescription_json,
      exercise: added.exercise,
    }
    const updated = [...items, asItem]
    setItems(updated)
    onItemsChange(block.id, updated)
  }

  return (
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

      {/* Exercise items */}
      {items.length > 0 ? (
        <ul className="mt-3">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onDeleted={handleItemDeleted}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-slate-500">No exercises yet. Add one below.</p>
      )}

      {/* Add exercise search */}
      <ExerciseSearch blockId={block.id} onItemAdded={handleItemAdded} />
    </section>
  )
}
