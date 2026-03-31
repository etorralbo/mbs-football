'use client'

import { useState } from 'react'
import { request } from '@/app/_shared/api/httpClient'

// ---------------------------------------------------------------------------
// Block name presets — same list as the template builder
// ---------------------------------------------------------------------------

export const BLOCK_NAME_OPTIONS = [
  'Preparation to Movement',
  'Plyometrics',
  'Primary Strength',
  'Secondary Strength',
  'Auxiliary Strength',
  'Recovery',
]

interface Props {
  sessionId: string
  onCreated: () => void
  onCancel: () => void
}

export function AddSessionBlockForm({ sessionId, onCreated, onCancel }: Props) {
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
      await request(`/v1/workout-sessions/${sessionId}/structure/blocks`, {
        method: 'POST',
        body: JSON.stringify({ name: blockName }),
      })
      onCreated()
    } catch {
      setError('Failed to create block. Please try again.')
      setCreating(false)
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-[#4f9cf9]/30 bg-[#0d1420] p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#4f9cf9]">
        Add block
      </p>

      <div className="space-y-2">
        <select
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={creating}
          className="w-full rounded-md border border-white/10 bg-[#131922] px-3 py-2 text-sm text-white focus:border-[#4f9cf9] focus:outline-none disabled:opacity-40"
        >
          {BLOCK_NAME_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
          <option value="__custom__">Custom name…</option>
        </select>

        {name === '__custom__' && (
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Block name"
            maxLength={255}
            disabled={creating}
            autoFocus
            className="w-full rounded-md border border-white/10 bg-[#131922] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none disabled:opacity-40"
          />
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleCreate}
          disabled={creating}
          className="rounded-md bg-[#4f9cf9] px-3 py-1.5 text-xs font-semibold text-[#0a0d14] transition-colors hover:bg-[#6aabfa] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {creating ? 'Creating…' : 'Create block'}
        </button>
        <button
          onClick={onCancel}
          disabled={creating}
          className="rounded-md px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-white disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
