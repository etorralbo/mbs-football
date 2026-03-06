import { describe, it, expect } from 'vitest'
import { getPostActionRedirect } from './postActionRedirect'

describe('getPostActionRedirect', () => {
  it('team_created → /team', () => {
    expect(getPostActionRedirect('team_created', 'COACH')).toBe('/team')
  })

  it('invite_accepted → /sessions', () => {
    expect(getPostActionRedirect('invite_accepted', 'ATHLETE')).toBe('/sessions')
  })

  it('template_created_ai → null (stay on detail page)', () => {
    expect(getPostActionRedirect('template_created_ai', 'COACH')).toBeNull()
  })
})
