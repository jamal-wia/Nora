import { describe, expect, it } from 'bun:test'
import { resolveAnonymousTabRequest } from './anonymous-tab'

describe('resolveAnonymousTabRequest', () => {
  it('opens a post, a reel or a video of Instagram on its embed page, which has the player', () => {
    expect(resolveAnonymousTabRequest('https://www.instagram.com/p/DeKe4mpkipT/')).toEqual({
      url: 'https://www.instagram.com/p/DeKe4mpkipT/embed/',
      desktopMode: false,
    })
    expect(resolveAnonymousTabRequest('https://www.instagram.com/reel/DeKe4mpkipT')?.url).toBe(
      'https://www.instagram.com/reel/DeKe4mpkipT/embed/',
    )
    expect(resolveAnonymousTabRequest('https://www.instagram.com/tv/DeKe4mpkipT/')?.url).toBe(
      'https://www.instagram.com/tv/DeKe4mpkipT/embed/',
    )
  })

  it('drops the query and the fragment of a post', () => {
    expect(resolveAnonymousTabRequest('https://www.instagram.com/p/DeKe4mpkipT/?igsh=x#top')?.url).toBe(
      'https://www.instagram.com/p/DeKe4mpkipT/embed/',
    )
  })

  it('does not wrap an embed page twice', () => {
    expect(resolveAnonymousTabRequest('https://www.instagram.com/p/DeKe4mpkipT/embed/')).toBeNull()
  })

  it('opens the search page of DuckDuckGo as the mobile site', () => {
    expect(resolveAnonymousTabRequest('https://duckduckgo.com/?q=site%3Ainstagram.com%2Fnasa%2F')).toEqual({
      url: 'https://duckduckgo.com/?q=site%3Ainstagram.com%2Fnasa%2F',
      desktopMode: false,
    })
  })

  it('refuses every other address', () => {
    for (const url of [
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
