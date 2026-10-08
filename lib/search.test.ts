import { describe, expect, it } from 'bun:test'
import {
  builtinSearchProviders,
  getEnabledSearchProviders,
  normalizeEnabledSearchProviderIds,
  normalizeSelectedSearchProviderId,
  resolveSearchUrl,
  searchSettingsProviderIds,
} from './search'

describe('public posts search provider', () => {
  it('is a built-in provider without a URL template', () => {
    expect(builtinSearchProviders['public-search'].kind).toBe('public')
    expect(builtinSearchProviders['public-search'].templateUrl).toBeUndefined()
  })

  it('can be turned on and off in settings', () => {
    expect(searchSettingsProviderIds).toContain('public-search')
  })

  it('survives normalization of the enabled list', () => {
    expect(normalizeEnabledSearchProviderIds(['duckduckgo', 'public-search'], [])).toEqual([
      'url',
      'duckduckgo',
      'public-search',
    ])
  })

  it('leaves the enabled list of an existing install as it was', () => {
    expect(normalizeEnabledSearchProviderIds(['url', 'duckduckgo', 'google'], [])).toEqual(['url', 'duckduckgo', 'google'])
  })

  it('can be selected only while enabled', () => {
    expect(normalizeSelectedSearchProviderId('public-search', ['url', 'public-search'])).toBe('public-search')
    expect(normalizeSelectedSearchProviderId('public-search', ['url', 'google'])).toBe('url')
  })

  it('shows up in the new tab menu when enabled', () => {
    const ids = getEnabledSearchProviders(['url', 'public-search'], []).map((provider) => provider.id)
    expect(ids).toEqual(['url', 'public-search'])
  })

  it('does not resolve to a URL through the generic template path', () => {
    expect(resolveSearchUrl('public-search', 'hello', [])).toBeNull()
  })
})
