/**
 * What a page may ask the app to open in a tab of its own, from the Anonymous
 * profile: DuckDuckGo's page for a search. Anything else a page asks for is refused,
 * so a page cannot use this to open whatever address it likes in that profile.
 */
export interface AnonymousTabRequest {
  url: string
}

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
  if (parsed.hostname === 'duckduckgo.com' && parsed.pathname === SEARCH_PATH && parsed.searchParams.has('q')) {
    return { url: parsed.toString() }
  }
  return null
}
