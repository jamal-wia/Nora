import { describe, expect, it } from 'bun:test'
import { ANONYMOUS_PROFILE_ID, isAnonymousProfile } from './anonymous'

describe('isAnonymousProfile', () => {
  it('matches only the reserved profile id', () => {
    expect(isAnonymousProfile(ANONYMOUS_PROFILE_ID)).toBe(true)
    expect(isAnonymousProfile('default')).toBe(false)
    expect(isAnonymousProfile('site:anonymous')).toBe(false)
    expect(isAnonymousProfile('Anonymous')).toBe(false)
    expect(isAnonymousProfile(undefined)).toBe(false)
    expect(isAnonymousProfile(null)).toBe(false)
  })
})
