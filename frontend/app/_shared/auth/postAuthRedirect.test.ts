import { describe, expect, it } from 'vitest'
import { getSafePostAuthPath } from './postAuthRedirect'

describe('getSafePostAuthPath', () => {
  it('returns fallback when next path is missing', () => {
    expect(getSafePostAuthPath(null, '/home')).toBe('/home')
  })

  it('accepts a safe internal path', () => {
    expect(getSafePostAuthPath('/join/ABC123', '/home')).toBe('/join/ABC123')
  })

  it('rejects absolute external URLs', () => {
    expect(getSafePostAuthPath('https://evil.example.com', '/home')).toBe('/home')
  })

  it('rejects protocol-relative URLs', () => {
    expect(getSafePostAuthPath('//evil.example.com', '/home')).toBe('/home')
  })
})
