/**
 * What a page may ask the app to open in a tab of its own, from the Anonymous
 * profile: the page of DuckDuckGo that searches for the posts of a profile. Anything else a page asks for is refused,
 * so a page cannot use this to open whatever address it likes in that profile.
 */
import { getSearchPageUsername } from './public-posts'

export interface AnonymousTabRequest {
  url: string
  /** The profile whose posts the page is a search for, when it is the search of `buildProfileSearchPageUrl`. */
  searchUsername?: string
}

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
  const searchUsername = getSearchPageUsername(url)
  return searchUsername ? { url: parsed.toString(), searchUsername } : null
}
