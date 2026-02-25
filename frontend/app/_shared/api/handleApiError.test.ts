import { describe, it, expect, vi } from 'vitest'
import { ForbiddenError, UnauthorizedError, NotFoundError } from './httpClient'
import { isNotOnboardedError, handleApiError } from './handleApiError'

// ---------------------------------------------------------------------------
// isNotOnboardedError
// ---------------------------------------------------------------------------

describe('isNotOnboardedError', () => {
  it('returns true for a ForbiddenError with the exact backend message', () => {
    const err = new ForbiddenError('User not onboarded. Please complete registration.')
    expect(isNotOnboardedError(err)).toBe(true)
  })

  it('returns true regardless of casing', () => {
    expect(isNotOnboardedError(new ForbiddenError('user NOT ONBOARDED'))).toBe(true)
  })

  it('returns false for a plain ForbiddenError with generic message', () => {
    expect(isNotOnboardedError(new ForbiddenError())).toBe(false)
    expect(isNotOnboardedError(new ForbiddenError('Forbidden'))).toBe(false)
  })

  it('returns false for a non-ForbiddenError even if message contains "not onboarded"', () => {
    expect(isNotOnboardedError(new Error('user not onboarded'))).toBe(false)
  })

  it('returns false for non-error values', () => {
    expect(isNotOnboardedError(null)).toBe(false)
    expect(isNotOnboardedError('not onboarded')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// handleApiError
// ---------------------------------------------------------------------------

describe('handleApiError', () => {
  function makeRouter() {
    return { replace: vi.fn() }
  }

  it('redirects to /login on UnauthorizedError', () => {
    const router = makeRouter()
    handleApiError(new UnauthorizedError(), router)
    expect(router.replace).toHaveBeenCalledWith('/login')
  })

  it('redirects to /onboarding on a not-onboarded ForbiddenError', () => {
    const router = makeRouter()
    handleApiError(
      new ForbiddenError('User not onboarded. Please complete registration.'),
      router,
    )
    expect(router.replace).toHaveBeenCalledWith('/onboarding')
  })

  it('re-throws a regular ForbiddenError (role-based)', () => {
    const router = makeRouter()
    const err = new ForbiddenError('Access denied. Required role: coach')
    expect(() => handleApiError(err, router)).toThrow(err)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('re-throws a NotFoundError', () => {
    const router = makeRouter()
    const err = new NotFoundError('Session 123 not found')
    expect(() => handleApiError(err, router)).toThrow(err)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('re-throws a generic Error', () => {
    const router = makeRouter()
    const err = new Error('unexpected')
    expect(() => handleApiError(err, router)).toThrow(err)
  })
})
