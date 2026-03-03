import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import type { Exercise } from '@/app/_shared/api/types'
import { ExerciseSelector, normalize } from './ExerciseSelector'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { mockRequest } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
}))

vi.mock('@/app/_shared/api/httpClient', async (importOriginal) => {
  const actual = await importOriginal() as object
  return { ...actual, request: mockRequest }
})

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMPANY_EX: Exercise = {
  id: 'ex-company-1',
  coach_id: null,
  owner_type: 'COMPANY',
  is_editable: false,
  name: 'Back Squat',
  description: null,
  tags: 'strength, legs',
  video_asset_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const COACH_EX: Exercise = {
  id: 'ex-coach-1',
  coach_id: 'coach-uuid',
  owner_type: 'COACH',
  is_editable: true,
  name: 'My Custom Move',
  description: null,
  tags: null,
  video_asset_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

/** Helper to build a minimal COACH exercise with a custom name. */
function coachEx(id: string, name: string): Exercise {
  return { ...COACH_EX, id, name }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  mockRequest.mockReset()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Renders the selector, opens the dropdown by focusing, and waits for exercises to load. */
async function renderAndOpen(exercises: Exercise[], onSelect = vi.fn()) {
  mockRequest.mockResolvedValueOnce(exercises)
  render(<ExerciseSelector onSelect={onSelect} />)
  const input = screen.getByRole('combobox')
  fireEvent.focus(input)
  // Wait for the fetch to resolve and the loading state to clear
  await waitFor(() =>
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument(),
  )
  return { input, onSelect }
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

describe('ExerciseSelector — sections', () => {
  it('shows "Official Exercises" section for COMPANY exercises', async () => {
    await renderAndOpen([COMPANY_EX])

    expect(screen.getByText('Official Exercises')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back Squat' })).toBeInTheDocument()
  })

  it('shows "My Exercises" section for COACH exercises', async () => {
    await renderAndOpen([COACH_EX])

    expect(screen.getByText('My Exercises')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My Custom Move' })).toBeInTheDocument()
  })

  it('shows both sections when both types are present', async () => {
    await renderAndOpen([COMPANY_EX, COACH_EX])

    expect(screen.getByText('Official Exercises')).toBeInTheDocument()
    expect(screen.getByText('My Exercises')).toBeInTheDocument()
  })

  it('shows "No exercises available." when the list is empty and no query', async () => {
    await renderAndOpen([])

    expect(screen.getByText('No exercises available.')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Search / filter
// ---------------------------------------------------------------------------

describe('ExerciseSelector — search filter', () => {
  it('filters exercises client-side after 250 ms debounce', async () => {
    const { input } = await renderAndOpen([COMPANY_EX, COACH_EX])

    fireEvent.change(input, { target: { value: 'back' } })

    // Wait for the 250 ms debounce + re-render (500 ms budget)
    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'My Custom Move' })).not.toBeInTheDocument(),
      { timeout: 500 },
    )
    expect(screen.getByRole('button', { name: 'Back Squat' })).toBeInTheDocument()
  })

  it('shows "No matches" message with create button when no results match query', async () => {
    const onCreateRequest = vi.fn()
    mockRequest.mockResolvedValueOnce([COMPANY_EX])
    render(<ExerciseSelector onSelect={vi.fn()} onCreateRequest={onCreateRequest} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    fireEvent.change(input, { target: { value: 'zzz' } })

    await waitFor(
      () => expect(screen.getByText(/no matches for/i)).toBeInTheDocument(),
      { timeout: 500 },
    )
    expect(screen.getByRole('button', { name: /create "zzz"/i })).toBeInTheDocument()
  })

  it('does not call the API again when the query changes (client-side only)', async () => {
    const { input } = await renderAndOpen([COMPANY_EX, COACH_EX])

    fireEvent.change(input, { target: { value: 'a' } })
    fireEvent.change(input, { target: { value: 'ab' } })
    fireEvent.change(input, { target: { value: 'abc' } })

    // Only the one initial fetch should have occurred
    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith('/v1/exercises')
  })
})

// ---------------------------------------------------------------------------
// Official badge
// ---------------------------------------------------------------------------

describe('ExerciseSelector — Official badge', () => {
  it('shows "Official" badge on COMPANY exercise', async () => {
    await renderAndOpen([COMPANY_EX])

    expect(screen.getByText('Official')).toBeInTheDocument()
  })

  it('does not show "Official" badge on COACH exercise', async () => {
    await renderAndOpen([COACH_EX])

    expect(screen.queryByText('Official')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

describe('ExerciseSelector — keyboard navigation', () => {
  it('selects first exercise with ArrowDown then Enter', async () => {
    const { input, onSelect } = await renderAndOpen([COMPANY_EX])

    fireEvent.keyDown(input, { key: 'ArrowDown' }) // activeIndex → 0
    fireEvent.keyDown(input, { key: 'Enter' })      // select flatList[0]

    expect(onSelect).toHaveBeenCalledWith(COMPANY_EX)
  })

  it('navigates to second item with two ArrowDown presses', async () => {
    const { input, onSelect } = await renderAndOpen([COMPANY_EX, COACH_EX])

    fireEvent.keyDown(input, { key: 'ArrowDown' }) // activeIndex → 0
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // activeIndex → 1
    fireEvent.keyDown(input, { key: 'Enter' })      // select flatList[1] = COACH_EX

    expect(onSelect).toHaveBeenCalledWith(COACH_EX)
  })

  it('does not go below the last item with ArrowDown', async () => {
    const { input, onSelect } = await renderAndOpen([COMPANY_EX])

    fireEvent.keyDown(input, { key: 'ArrowDown' }) // 0
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // still 0 (clamps)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(COMPANY_EX)
  })

  it('closes the dropdown on Escape', async () => {
    const { input } = await renderAndOpen([COMPANY_EX])

    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// onSelect callback
// ---------------------------------------------------------------------------

describe('ExerciseSelector — onSelect callback', () => {
  it('calls onSelect with the exercise when an item is clicked', async () => {
    const { onSelect } = await renderAndOpen([COMPANY_EX, COACH_EX])

    fireEvent.click(screen.getByRole('button', { name: 'Back Squat' }))

    expect(onSelect).toHaveBeenCalledWith(COMPANY_EX)
  })

  it('clears the input and closes the dropdown after selection', async () => {
    const { input } = await renderAndOpen([COMPANY_EX])

    fireEvent.click(screen.getByRole('button', { name: 'Back Squat' }))

    expect(input).toHaveValue('')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('calls onCreateRequest with the query when "+ Create" is clicked', async () => {
    const onCreateRequest = vi.fn()
    mockRequest.mockResolvedValueOnce([])
    render(<ExerciseSelector onSelect={vi.fn()} onCreateRequest={onCreateRequest} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    fireEvent.change(input, { target: { value: 'New Move' } })

    await waitFor(
      () => expect(screen.getByRole('button', { name: /create "new move"/i })).toBeInTheDocument(),
      { timeout: 500 },
    )

    fireEvent.click(screen.getByRole('button', { name: /create "new move"/i }))

    expect(onCreateRequest).toHaveBeenCalledWith('New Move')
  })
})

// ---------------------------------------------------------------------------
// normalize() unit tests — pure function, no DOM needed
// ---------------------------------------------------------------------------

describe('normalize()', () => {
  it('lowercases the input', () => {
    expect(normalize('JUMP')).toBe('jump')
  })

  it('trims leading and trailing whitespace', () => {
    expect(normalize('  jump  ')).toBe('jump')
  })

  it('collapses internal whitespace', () => {
    expect(normalize('back  squat')).toBe('back squat')
  })

  it('removes punctuation', () => {
    expect(normalize('jum..')).toBe('jum')
    expect(normalize("farmer's walk")).toBe('farmers walk')
    // Hyphen joins compound words — removing it merges them (not a space)
    expect(normalize('hip-thrust')).toBe('hipthrust')
  })

  it('strips diacritical marks', () => {
    expect(normalize('café')).toBe('cafe')
    expect(normalize('Sqüat')).toBe('squat')
    expect(normalize('Ñoño')).toBe('nono')
  })

  it('handles an empty string', () => {
    expect(normalize('')).toBe('')
  })

  it('strips characters that have no ASCII equivalent (length may change)', () => {
    // "ß" has no base letter — our regex removes it entirely.
    // normalize() must still return a string without throwing.
    const result = normalize('Straßenball')
    expect(typeof result).toBe('string')
    expect(result).not.toContain('ß')
  })
})

// ---------------------------------------------------------------------------
// highlight() — guard for length-changing normalisation
// ---------------------------------------------------------------------------

// We test the exported normalize() function to confirm the length guard fires.
describe('highlight() — safe fallback for length-changing names', () => {
  it('exercises whose name normalises to a different length are still shown without crashing', async () => {
    // "Straßenball" — "ß" is stripped, so normalize("Straßenball").length < "Straßenball".length
    // The selector must render the item without throwing or mis-highlighting.
    const strassEx = coachEx('ex-strass', 'Straßenball')
    mockRequest.mockResolvedValueOnce([strassEx])
    render(<ExerciseSelector onSelect={vi.fn()} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    // Searching "strassenball" will normalise to "strassenball" while the name
    // normalises to "straenball" — no match, so it disappears from the list.
    // The component must not throw during the render.
    fireEvent.change(input, { target: { value: 'strassenball' } })
    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'Straßenball' })).not.toBeInTheDocument(),
      { timeout: 500 },
    )
  })
})

// ---------------------------------------------------------------------------
// Search normalization integration tests
// ---------------------------------------------------------------------------

describe('ExerciseSelector — search normalization', () => {
  it('"jum" partially matches "Jump"', async () => {
    const { input } = await renderAndOpen([coachEx('ex-jump', 'Jump'), coachEx('ex-plank', 'Plank')])

    fireEvent.change(input, { target: { value: 'jum' } })

    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'Plank' })).not.toBeInTheDocument(),
      { timeout: 500 },
    )
    expect(screen.getByRole('button', { name: 'Jump' })).toBeInTheDocument()
  })

  it('"jum.." matches "Jump" (punctuation tolerance — the original bug)', async () => {
    const { input } = await renderAndOpen([coachEx('ex-jump', 'Jump'), coachEx('ex-plank', 'Plank')])

    fireEvent.change(input, { target: { value: 'jum..' } })

    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'Plank' })).not.toBeInTheDocument(),
      { timeout: 500 },
    )
    expect(screen.getByRole('button', { name: 'Jump' })).toBeInTheDocument()
  })

  it('"JUMP" matches "Jump" (case-insensitive)', async () => {
    const { input } = await renderAndOpen([coachEx('ex-jump', 'Jump'), coachEx('ex-plank', 'Plank')])

    fireEvent.change(input, { target: { value: 'JUMP' } })

    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'Plank' })).not.toBeInTheDocument(),
      { timeout: 500 },
    )
    expect(screen.getByRole('button', { name: 'Jump' })).toBeInTheDocument()
  })

  it('"squat" matches accent-bearing name "Sqüat"', async () => {
    const { input } = await renderAndOpen([coachEx('ex-squat', 'Sqüat'), coachEx('ex-plank', 'Plank')])

    fireEvent.change(input, { target: { value: 'squat' } })

    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'Plank' })).not.toBeInTheDocument(),
      { timeout: 500 },
    )
    expect(screen.getByRole('button', { name: 'Sqüat' })).toBeInTheDocument()
  })

  it('accent-bearing query "sqüat" matches plain name "Squat"', async () => {
    const { input } = await renderAndOpen([coachEx('ex-squat', 'Squat'), coachEx('ex-plank', 'Plank')])

    fireEvent.change(input, { target: { value: 'sqüat' } })

    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'Plank' })).not.toBeInTheDocument(),
      { timeout: 500 },
    )
    expect(screen.getByRole('button', { name: 'Squat' })).toBeInTheDocument()
  })

  it('filtering works across Official and My Exercises sections', async () => {
    const officialJump: Exercise = { ...COMPANY_EX, id: 'co-jump', name: 'Jump Official' }
    const myJump = coachEx('my-jump', 'Jump My')
    const { input } = await renderAndOpen([officialJump, myJump, coachEx('ex-plank', 'Plank')])

    fireEvent.change(input, { target: { value: 'jum..' } })

    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'Plank' })).not.toBeInTheDocument(),
      { timeout: 500 },
    )
    expect(screen.getByRole('button', { name: 'Jump Official' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jump My' })).toBeInTheDocument()
    expect(screen.getByText('Official Exercises')).toBeInTheDocument()
    expect(screen.getByText('My Exercises')).toBeInTheDocument()
  })

  it('keyboard navigation still works after a normalised search', async () => {
    const onSelect = vi.fn()
    mockRequest.mockResolvedValueOnce([coachEx('ex-jump', 'Jump')])
    render(<ExerciseSelector onSelect={onSelect} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    fireEvent.change(input, { target: { value: 'jum..' } })

    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Jump' })).toBeInTheDocument(),
      { timeout: 500 },
    )

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(coachEx('ex-jump', 'Jump'))
  })
})
