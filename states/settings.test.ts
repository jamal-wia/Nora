import { beforeEach, describe, expect, it } from 'bun:test'
import { settings$ } from './settings'

beforeEach(() => {
  settings$.profiles.set([{ id: 'default', name: 'Default', color: '#6366f1', isDefault: true }])
  settings$.anonymousMode.set(false)
  settings$.anonymousDisabledHosts.set([])
})

describe('Anonymous profile', () => {
  it('is not there until something asks for it', () => {
    expect(settings$.profiles.get().map((profile) => profile.id)).toEqual(['default'])
  })

  it('is created once, however often it is asked for', () => {
    expect(settings$.ensureAnonymousProfile()).toBe('anonymous')
    expect(settings$.ensureAnonymousProfile()).toBe('anonymous')
    expect(settings$.profiles.get().filter((profile) => profile.id === 'anonymous')).toHaveLength(1)
  })

  it('is created by turning the mode on, and not by turning it off', () => {
    settings$.setAnonymousMode(false)
    expect(settings$.profiles.get().some((profile) => profile.id === 'anonymous')).toBe(false)

    settings$.setAnonymousMode(true)
    expect(settings$.anonymousMode.get()).toBe(true)
    expect(settings$.profiles.get().some((profile) => profile.id === 'anonymous')).toBe(true)

    settings$.setAnonymousMode(false)
    expect(settings$.anonymousMode.get()).toBe(false)
  })
})

describe('anonymous mode per-site switch', () => {
  it('turns the mode off for a site and back on, covering subdomains', () => {
    settings$.setAnonymousHostDisabled('www.reddit.com', true)
    expect(settings$.anonymousDisabledHosts.get()).toEqual(['reddit.com'])

    settings$.setAnonymousHostDisabled('old.reddit.com', false)
    expect(settings$.anonymousDisabledHosts.get()).toEqual([])
  })
})
