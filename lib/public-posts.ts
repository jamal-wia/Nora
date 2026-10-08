/**
 * Public posts of a profile found through DuckDuckGo, for the places where a site
 * only shows the first screenful of a profile without an account. They are what the
 * search engine has indexed, not the profile's feed: no media, no guarantee that
 * every post is there, and the order is the engine's -- so the date is read from
 * the result and the list is sorted by it here.
 */

export interface SearchResult {
  url: string
  title: string
  snippet: string
}

export interface PublicPost {
  url: string
  shortcode: string
  /** Epoch milliseconds, UTC, or null when the result carries no date. */
  date: number | null
  likes: string | null
  comments: string | null
  caption: string
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return entities[entity.toLowerCase()] ?? match
  })
}

const stripTags = (value: string) => decodeEntities(value.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()

/** DuckDuckGo wraps every result link in a redirect that carries the real address. */
export function unwrapResultUrl(href: string) {
  try {
    const url = new URL(decodeEntities(href), 'https://duckduckgo.com')
    const target = url.searchParams.get('uddg')
    return target ?? url.toString()
  } catch {
    return null
  }
}

/** Reads the results out of the HTML page of DuckDuckGo (`html.duckduckgo.com/html/`). */
export function parseSearchResults(html: string): SearchResult[] {
  const results: SearchResult[] = []
  const blocks = html.split(/<div class="result results_links/).slice(1)
  for (const block of blocks) {
    const link = block.match(/<a [^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/)
    if (!link) {
      continue
    }
    const url = unwrapResultUrl(link[1])
    if (!url) {
      continue
    }
    const snippet = block.match(/<a [^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
    results.push({ url, title: stripTags(link[2]), snippet: snippet ? stripTags(snippet[1]) : '' })
  }
  return results
}

const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

function parseSnippetDate(text: string) {
  const match = text.match(/\bon ([A-Z][a-z]+) (\d{1,2}), (\d{4})\b/)
  if (!match) {
    return null
  }
  const month = months.indexOf(match[1].toLowerCase())
  return month === -1 ? null : Date.UTC(Number(match[3]), month, Number(match[2]))
}

/** The post a result points at, with what its description says about it. Null for anything else. */
export function toInstagramPost(result: SearchResult, username: string): PublicPost | null {
  let path: string[]
  try {
    const url = new URL(result.url)
    if (!/(^|\.)instagram\.com$/.test(url.hostname)) {
      return null
    }
    path = url.pathname.split('/').filter(Boolean)
  } catch {
    return null
  }

  // /<username>/p/<code>, /<username>/reel/<code>, or the profile-less /p/<code>.
  const offset = path[0]?.toLowerCase() === username.toLowerCase() ? 1 : 0
  const kind = path[offset]
  const shortcode = path[offset + 1]
  if ((kind !== 'p' && kind !== 'reel') || !shortcode || path.length !== offset + 2) {
    return null
  }
  // A result for another account's post that merely mentions this one is not this profile's.
  if (offset === 0 && !new RegExp(`\\b${username.replace(/[^\w.]/g, '')}\\b`, 'i').test(result.snippet.slice(0, 160))) {
    return null
  }

  const counts = result.snippet.match(/^([\d.,]+[KM]?) likes?, ([\d.,]+[KM]?) comments?/i)
  const caption = result.snippet.match(/: "([\s\S]*?)"?$/)
  return {
    url: result.url,
    shortcode,
    date: parseSnippetDate(result.snippet),
    likes: counts?.[1] ?? null,
    comments: counts?.[2] ?? null,
    caption: caption?.[1]?.trim() ?? '',
  }
}

/**
 * What to add below a profile: the posts that are not already on the page, once
 * each, newest first. A post without a date goes last rather than being dropped.
 */
export function continuePosts(posts: PublicPost[], shownShortcodes: Iterable<string>) {
  const shown = new Set(shownShortcodes)
  const seen = new Set<string>()
  const fresh = posts.filter((post) => {
    if (shown.has(post.shortcode) || seen.has(post.shortcode)) {
      return false
    }
    seen.add(post.shortcode)
    return true
  })
  return fresh.sort((a, b) => {
    if (a.date === b.date) {
      return 0
    }
    if (a.date === null) {
      return 1
    }
    if (b.date === null) {
      return -1
    }
    return b.date - a.date
  })
}

const USERNAME = /^[A-Za-z0-9._]{1,30}$/
const SEARCH_ENDPOINT = 'https://html.duckduckgo.com/html/'

/** The search that lists a profile's posts, or null for a name that is not a profile name. */
export function buildProfileSearchQuery(username: string) {
  return USERNAME.test(username) ? `site:instagram.com/${username}/` : null
}

/**
 * The same search on DuckDuckGo's own page, in a tab of the browser, which is where a person
 * can deal with a check themselves. It is the HTML page of the search, the one that is read
 * for the results, and so the posts found there can be added to the profile once it has loaded.
 */
export function buildProfileSearchPageUrl(username: string) {
  const query = buildProfileSearchQuery(username)
  return query ? `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}` : null
}

/** The profile a search page of `buildProfileSearchPageUrl` is for, or null for any other address. */
export function getSearchPageUsername(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.origin + parsed.pathname !== SEARCH_ENDPOINT) {
      return null
    }
    const match = parsed.searchParams.get('q')?.match(/^site:instagram\.com\/([A-Za-z0-9._]{1,30})\/$/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/**
 * Whether the page is DuckDuckGo asking for proof of a person instead of results.
 * It is never answered or worked around: the caller sends the person to the page.
 */
export function isChallengePage(html: string) {
  return parseSearchResults(html).length === 0 && /anomaly|captcha|challenge-form|unusual traffic/i.test(html)
}

/** How many posts of a profile Instagram shows without an account, and so how many of the newest results are left out. */
export const POSTS_SHOWN_WITHOUT_LOGIN = 12
export const POSTS_PER_PAGE = 12

/**
 * Instagram's own embed page for a post, which is how other sites show one with its
 * picture. Null for an address that is not a post of Instagram.
 */
export function toEmbedUrl(post: Pick<PublicPost, 'url'>) {
  try {
    const url = new URL(post.url)
    const path = url.pathname.split('/').filter(Boolean)
    const kindIndex = path.findIndex((part) => part === 'p' || part === 'reel')
    const shortcode = path[kindIndex + 1]
    if (kindIndex === -1 || !shortcode || !/(^|\.)instagram\.com$/.test(url.hostname)) {
      return null
    }
    return `https://www.instagram.com/${path[kindIndex]}/${encodeURIComponent(shortcode)}/embed/`
  } catch {
    return null
  }
}
