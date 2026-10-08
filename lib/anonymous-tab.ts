/**
 * What a page may ask the app to open in a tab of its own, from the Anonymous
 * profile: a post of Instagram, shown on its embed page -- the page Instagram makes
 * for showing a public post on other sites, which has the player and needs no
 * account -- and DuckDuckGo's page for a search. Anything else a page asks for is refused, so
 * a page cannot use this to open whatever address it likes in that profile.
 */
export interface AnonymousTabRequest {
  url: string
  desktopMode: boolean
}

const INSTAGRAM_POST = /^\/(p|reel|tv)\/([A-Za-z0-9_-]{5,})\/?$/
const SEARCH_PATH = '/'

export function resolveAnonymousTabRequest(url: unknown): AnonymousTabRequest | null {
  if (typeof url !== 'string') {
    return null
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    return null
  }
  const post = parsed.hostname === 'www.instagram.com' ? parsed.pathname.match(INSTAGRAM_POST) : null
  if (post) {
    return { url: `https://www.instagram.com/${post[1]}/${post[2]}/embed/`, desktopMode: false }
  }
  if (parsed.hostname === 'duckduckgo.com' && parsed.pathname === SEARCH_PATH && parsed.searchParams.has('q')) {
    return { url: parsed.toString(), desktopMode: false }
  }
  return null
}
