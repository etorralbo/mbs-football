import { afterEach, describe, it, expect } from 'vitest'
import { getToken, setToken, clearToken } from './tokenStorage'

afterEach(() => {
  localStorage.clear()
})

describe('tokenStorage', () => {
  it('returns null when nothing is stored', () => {
    expect(getToken()).toBeNull()
  })

  it('stores a token that getToken retrieves', () => {
    setToken('abc123')
    expect(getToken()).toBe('abc123')
  })

  it('clearToken removes the stored token', () => {
    setToken('abc123')
    clearToken()
    expect(getToken()).toBeNull()
  })

  it('overwriting a token replaces the previous value', () => {
    setToken('first')
    setToken('second')
    expect(getToken()).toBe('second')
  })
})
