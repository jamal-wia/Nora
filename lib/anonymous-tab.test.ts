import { describe, expect, it } from 'bun:test'
import { resolveAnonymousTabRequest } from './anonymous-tab'

describe('resolveAnonymousTabRequest', () => {
  it('opens the search page of DuckDuckGo as the mobile site', () => {
    expect(resolveAnonymousTabRequest('https://duckduckgo.com/?q=site%3Ainstagram.com%2Fnasa%2F')).toEqual({
      url: 'https://duckduckgo.com/?q=site%3Ainstagram.com%2Fnasa%2F',
    })
  })

  it('refuses every other address', () => {
    for (const url of [
      'https://www.instagram.com/p/DeKe4mpkipT/',
      'https://www.instagram.com/p/DeKe4mpkipT/embed/',
      'https://www.instagram.com/nasa/',
      'https://www.instagram.com/accounts/login/',
      'https://www.instagram.com/p/',
      'https://instagram.com/p/DeKe4mpkipT/',
      'https://www.instagram.com.evil.net/p/DeKe4mpkipT/',
      'https://evil.net/p/DeKe4mpkipT/',
      'http://www.instagram.com/p/DeKe4mpkipT/',
      'https://user:pw@www.instagram.com/p/DeKe4mpkipT/',
      'https://www.instagram.com:8443/p/DeKe4mpkipT/',
      'https://duckduckgo.com/',
      'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fevil.net',
      'javascript:alert(1)',
      'intent://x#Intent;end',
      'not a url',
    ]) {
      expect(resolveAnonymousTabRequest(url)).toBeNull()
    }
    expect(resolveAnonymousTabRequest(undefined)).toBeNull()
    expect(resolveAnonymousTabRequest(42)).toBeNull()
  })
})
