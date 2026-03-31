'use client'

import { useState } from 'react'
import { request } from '@/app/_shared/api/httpClient'

// ---------------------------------------------------------------------------
// PrescriptionEditor
//
// Inline editor for a single exercise's set prescription in a customized
// session. Shows editable reps/weight/rpe rows mirroring the SetRow layout.
//
// Called from the session detail page when the coach clicks "Edit prescription"
// in customize mode. On save, calls the session structure PATCH endpoint.
// ---------------------------------------------------------------------------

interface SetRow {
  reps: string
  weight: string
  rpe: string
}

function parseSets(prescription: Record<string, unknown>): SetRow[] {
  if (Array.isArray(prescription.sets) && prescription.sets.length > 0) {
    return prescription.sets.map((s: Record<string, unknown>) => ({
      reps:   s.reps   != null ? String(s.reps)   : '',
      weight: s.weight != null ? String(s.weight) : '',
      rpe:    s.rpe    != null ? String(s.rpe)    : '',
    }))
  }
  // Legacy scalar format: sets is a count
  const n = typeof prescription.sets === 'number' && prescription.sets >= 1 ? prescription.sets : 1
  return Array.from({ length: n }, () => ({
    reps:   prescription.reps   != null ? String(prescription.reps)   : '',
    weight: prescription.weight != null ? String(prescription.weight) : '',
    rpe:    prescription.rpe    != null ? String(prescription.rpe)    : '',
  }))
}

function parseOpt(v: string): number | null {
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

interface Props {
  sessionId: string
  exerciseId: string
  currentPrescription: Record<string, unknown>
  onSaved: () => void
  onCancel: () => void
}

export function PrescriptionEditor({
  sessionId,
  exerciseId,
  currentPrescription,
  onSaved,
  onCancel,
}: Props) {
  const [sets, setSets] = useState<SetRow[]>(() => parseSets(currentPrescription))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateSet(index: number, field: 'reps' | 'weight' | 'rpe', value: string) {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await request(
        `/v1/workout-sessions/${sessionId}/structure/exercises/${exerciseId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            sets: sets.map((s) => ({
              reps:   parseOpt(s.reps),
              weight: parseOpt(s.weight),
              rpe:    parseOpt(s.rpe),
            })),
          }),
        },
      )
      onSaved()
    } catch {
      setError('Failed to save prescription. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-[#4f9cf9]/30 bg-[#0d1420] p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#4f9cf9]">
        Edit prescription
      </p>

      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        <span className="w-5" />
        <span className="w-20">Reps</span>
        <span className="w-20">Weight (kg)</span>
        <span className="w-20">RPE</span>
      </div>

      <div className="space-y-2">
        {sets.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 text-sm text-slate-500">{i + 1}</span>
            <input
              type="number"
              value={s.reps}
              onChange={(e) => updateSet(i, 'reps', e.target.value)}
              placeholder="Reps"
              min={0}
              disabled={saving}
              aria-label={`Prescribed set ${i + 1} reps`}
              className="w-20 rounded-md border border-white/10 bg-[#131922] px-2 py-1.5 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none focus:ring-1 focus:ring-[#4f9cf9] disabled:opacity-40"
            />
            <input
              type="number"
              value={s.weight}
              onChange={(e) => updateSet(i, 'weight', e.target.value)}
              placeholder="kg"
              min={0}
              step={0.5}
              disabled={saving}
              aria-label={`Prescribed set ${i + 1} weight`}
              className="w-20 rounded-md border border-white/10 bg-[#131922] px-2 py-1.5 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none focus:ring-1 focus:ring-[#4f9cf9] disabled:opacity-40"
            />
            <input
              type="number"
              value={s.rpe}
              onChange={(e) => updateSet(i, 'rpe', e.target.value)}
              placeholder="RPE"
              min={1}
              max={10}
              step={0.5}
              disabled={saving}
              aria-label={`Prescribed set ${i + 1} rpe`}
              className="w-20 rounded-md border border-white/10 bg-[#131922] px-2 py-1.5 text-sm text-white placeholder:text-slate-600 focus:border-[#4f9cf9] focus:outline-none focus:ring-1 focus:ring-[#4f9cf9] disabled:opacity-40"
            />
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-[#4f9cf9] px-3 py-1.5 text-xs font-semibold text-[#0a0d14] transition-colors hover:bg-[#6aabfa] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-white disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
