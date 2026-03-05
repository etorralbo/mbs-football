'use client'

/**
 * ExerciseForm
 *
 * Multi-field form for creating or editing a COACH exercise.
 * All text is rendered via React JSX — no dangerouslySetInnerHTML.
 *
 * Validation rules (mirroring the backend):
 *   name:        3–80 chars
 *   description: min 20 chars, required
 *   tags:        at least 1; each tag max 30 chars, lowercase + trimmed
 */

import { useEffect, useRef, useState } from 'react'
import { request } from '@/app/_shared/api/httpClient'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExerciseFormValues {
  name: string
  description: string
  tags: string[]
}

interface Props {
  /** Initial values (for edit mode). */
  initial?: Partial<ExerciseFormValues>
  /** Called when the form is submitted successfully. */
  onSubmit: (values: ExerciseFormValues) => Promise<void>
  /** Called when the form is cancelled. */
  onCancel: () => void
  /** Whether the outer submit is in progress. */
  submitting?: boolean
  /** Optional error from the outer submit call. */
  submitError?: string | null
  /** Notifies parent when form state diverges from initial values. */
  onDirtyChange?: (dirty: boolean) => void
}

// ---------------------------------------------------------------------------
// Validation helpers (pure, no side-effects — easy to unit-test)
// ---------------------------------------------------------------------------

export function validateName(name: string): string | null {
  const v = name.trim()
  if (v.length < 3) return 'Name must be at least 3 characters'
  if (v.length > 80) return 'Name must be 80 characters or fewer'
  return null
}

export function validateDescription(desc: string): string | null {
  if (desc.trim().length < 20) return 'Description must be at least 20 characters'
  return null
}

export function normaliseTag(raw: string): string {
  return raw.trim().toLowerCase()
}

export function validateTag(tag: string): string | null {
  const t = normaliseTag(tag)
  if (!t) return 'Tag cannot be empty'
  if (t.length > 30) return 'Tag must be 30 characters or fewer'
  return null
}

// ---------------------------------------------------------------------------
// TagInput sub-component
// ---------------------------------------------------------------------------

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  suggestions: string[]
  error?: string | null
}

function TagInput({ tags, onChange, suggestions, error }: TagInputProps) {
  const [input, setInput] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = suggestions.filter(
    (s) => s.includes(input.toLowerCase()) && !tags.includes(s)
  )

  function addTag(raw: string) {
    const tag = normaliseTag(raw)
    const err = validateTag(tag)
    if (err) { setTagError(err); return }
    if (tags.includes(tag)) { setInput(''); setTagError(null); return }
    onChange([...tags, tag])
    setInput('')
    setTagError(null)
    setShowDropdown(false)
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (input.trim()) addTag(input)
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1))
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  return (
    <div>
      {/* Chip row */}
      <div
        className="flex flex-wrap gap-1.5 min-h-[38px] rounded-md border border-white/10 bg-[#0d1420] px-2 py-1.5 cursor-text focus-within:border-[#4f9cf9]"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-[#1e3a5f] px-2 py-0.5 text-xs font-medium text-[#4f9cf9]"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
              aria-label={`Remove tag ${tag}`}
              className="leading-none text-[#4f9cf9]/60 hover:text-[#4f9cf9] transition-colors"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setShowDropdown(true)
            setTagError(null)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          placeholder={tags.length === 0 ? 'Add a tag (e.g. strength)' : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
        />
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && (input || filtered.length > 0) && (
        <ul
          role="listbox"
          className="mt-1 max-h-40 overflow-y-auto rounded-md border border-white/10 bg-[#131922] shadow-lg"
        >
          {filtered.map((s) => (
            <li
              key={s}
              role="option"
              aria-selected={false}
              onMouseDown={() => addTag(s)}
              className="cursor-pointer px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              {s}
            </li>
          ))}
          {input.trim() && !suggestions.includes(normaliseTag(input)) && (
            <li
              role="option"
              aria-selected={false}
              onMouseDown={() => addTag(input)}
              className="cursor-pointer px-3 py-2 text-sm text-[#c8f135] hover:bg-white/5"
            >
              Create &ldquo;{normaliseTag(input)}&rdquo;
            </li>
          )}
          {filtered.length === 0 && !input.trim() && (
            <li className="px-3 py-2 text-xs text-slate-600">Type to search or create a tag</li>
          )}
        </ul>
      )}

      {/* Inline errors */}
      {tagError && <p className="mt-1 text-xs text-red-400">{tagError}</p>}
      {error && !tagError && <p className="mt-1 text-xs text-red-400">{error}</p>}
      <p className="mt-1 text-xs text-slate-600">Press Enter or comma to add a tag. At least 1 required.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExerciseForm
// ---------------------------------------------------------------------------

export default function ExerciseForm({
  initial,
  onSubmit,
  onCancel,
  submitting = false,
  submitError = null,
  onDirtyChange,
}: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [suggestions, setSuggestions] = useState<string[]>([])

  const [nameError, setNameError] = useState<string | null>(null)
  const [descError, setDescError] = useState<string | null>(null)
  const [tagsError, setTagsError] = useState<string | null>(null)

  // Dirty tracking — notify parent when form state diverges from initial values
  const initialRef = useRef(initial)
  useEffect(() => {
    const init = initialRef.current
    const dirty =
      name !== (init?.name ?? '') ||
      description !== (init?.description ?? '') ||
      JSON.stringify(tags) !== JSON.stringify(init?.tags ?? [])
    onDirtyChange?.(dirty)
  }, [name, description, tags, onDirtyChange])

  const descLen = description.trim().length
  const isValid =
    !validateName(name) &&
    !validateDescription(description) &&
    tags.length >= 1

  // Fetch tag suggestions once on mount
  useEffect(() => {
    request<string[]>('/v1/exercises/tags')
      .then(setSuggestions)
      .catch(() => {/* non-fatal — autocomplete gracefully degrades */})
  }, [])

  function handleNameBlur() {
    setNameError(validateName(name))
  }

  function handleDescBlur() {
    setDescError(validateDescription(description))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Run all validations before submitting
    const nErr = validateName(name)
    const dErr = validateDescription(description)
    const tErr = tags.length < 1 ? 'At least one tag is required' : null

    setNameError(nErr)
    setDescError(dErr)
    setTagsError(tErr)

    if (nErr || dErr || tErr) return

    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      tags,
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {/* Name */}
      <div>
        <label htmlFor="ex-name" className="block text-xs font-medium text-slate-400 mb-1">
          Name <span className="text-red-400">*</span>
        </label>
        <input
          id="ex-name"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setNameError(null) }}
          onBlur={handleNameBlur}
          maxLength={80}
          placeholder="e.g. Goblet Squat"
          aria-describedby={nameError ? 'ex-name-error' : undefined}
          aria-invalid={!!nameError}
          className={`w-full rounded-md border bg-[#0d1420] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-colors ${
            nameError ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-[#4f9cf9]'
          }`}
          autoFocus
        />
        {nameError && (
          <p id="ex-name-error" role="alert" className="mt-1 text-xs text-red-400">{nameError}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="ex-desc" className="block text-xs font-medium text-slate-400 mb-1">
          Description <span className="text-red-400">*</span>
          <span className={`ml-2 font-normal ${descLen >= 20 ? 'text-slate-600' : 'text-amber-500'}`}>
            ({descLen} / 20 min)
          </span>
        </label>
        <textarea
          id="ex-desc"
          value={description}
          onChange={(e) => { setDescription(e.target.value); setDescError(null) }}
          onBlur={handleDescBlur}
          rows={3}
          placeholder="Describe the movement, key cues, and muscles targeted. Minimum 20 characters."
          aria-describedby={descError ? 'ex-desc-error' : undefined}
          aria-invalid={!!descError}
          className={`w-full rounded-md border bg-[#0d1420] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none resize-none transition-colors ${
            descError ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-[#4f9cf9]'
          }`}
        />
        {descError && (
          <p id="ex-desc-error" role="alert" className="mt-1 text-xs text-red-400">{descError}</p>
        )}
      </div>

      {/* Tags */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">
          Tags <span className="text-red-400">*</span>
        </label>
        <TagInput
          tags={tags}
          onChange={(t) => { setTags(t); setTagsError(null) }}
          suggestions={suggestions}
          error={tagsError}
        />
      </div>

      {/* Submit error */}
      {submitError && (
        <p role="alert" className="text-xs text-red-400">{submitError}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting || !isValid}
          className="rounded-md bg-[#c8f135] px-4 py-1.5 text-xs font-bold text-[#0a0d14] hover:bg-[#d4f755] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Saving…' : 'Save exercise'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
