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
const MAX_PAGES = 3
const REQUEST_TIMEOUT_MS = 15_000

/** The search that lists a profile's posts, or null for a name that is not a profile name. */
export function buildProfileSearchQuery(username: string) {
  return USERNAME.test(username) ? `site:instagram.com/${username}/` : null
}

/** The same search on DuckDuckGo's own page, which is where a person can deal with a check themselves. */
export function buildProfileSearchPageUrl(username: string) {
  const query = buildProfileSearchQuery(username)
  return query ? `https://duckduckgo.com/?q=${encodeURIComponent(query)}` : null
}

/**
 * Whether the page is DuckDuckGo asking for proof of a person instead of results.
 * It is never answered or worked around: the caller sends the person to the page.
 */
export function isChallengePage(html: string) {
  return parseSearchResults(html).length === 0 && /anomaly|captcha|challenge-form|unusual traffic/i.test(html)
}

/** The form behind the "Next" button, as the body of the request it sends. Null on the last page. */
export function parseNextPageForm(html: string) {
  const form = html.match(/<div class="nav-link">\s*<form[^>]*>([\s\S]*?)<\/form>/)
  if (!form) {
    return null
  }
  const body = new URLSearchParams()
  for (const input of form[1].matchAll(/<input\b[^>]*>/g)) {
    const name = input[0].match(/name=["']([^"']*)["']/)?.[1]
    const value = input[0].match(/value=["']([^"']*)["']/)?.[1]
    if (name && value !== undefined && !/type=["']submit["']/.test(input[0])) {
      body.set(name, decodeEntities(value))
    }
  }
  return body.has('q') ? body : null
}

export type PublicPostsResult =
  | { status: 'ok'; posts: PublicPost[] }
  | { status: 'challenge' }
  | { status: 'error' }

type Fetch = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean
  text: () => Promise<string>
}>

/**
 * The posts of a profile that DuckDuckGo has indexed, at most a few result pages
 * of them, not yet on the page and newest first. Stops at the first sign of a
 * check and says so, so the caller can hand the person the search page.
 */
export async function fetchProfilePosts(
  username: string,
  shownShortcodes: Iterable<string>,
  fetchImpl: Fetch = fetch as unknown as Fetch,
): Promise<PublicPostsResult> {
  const query = buildProfileSearchQuery(username)
  if (!query) {
    return { status: 'error' }
  }

  const posts: PublicPost[] = []
  let request: { url: string; init?: Parameters<Fetch>[1] } = { url: `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}` }
  for (let page = 0; page < MAX_PAGES; page++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let html: string
    try {
      const res = await fetchImpl(request.url, { ...request.init, signal: controller.signal })
      if (!res.ok) {
        return page === 0 ? { status: 'error' } : { status: 'ok', posts: continuePosts(posts, shownShortcodes) }
      }
      html = await res.text()
    } catch {
      return page === 0 ? { status: 'error' } : { status: 'ok', posts: continuePosts(posts, shownShortcodes) }
    } finally {
      clearTimeout(timer)
    }

    if (isChallengePage(html)) {
      return { status: 'challenge' }
    }
    for (const result of parseSearchResults(html)) {
      const post = toInstagramPost(result, username)
      if (post) {
        posts.push(post)
      }
    }
    const next = parseNextPageForm(html)
    if (!next) {
      break
    }
    request = {
      url: SEARCH_ENDPOINT,
      init: { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: next.toString() },
    }
  }
  return { status: 'ok', posts: continuePosts(posts, shownShortcodes) }
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
