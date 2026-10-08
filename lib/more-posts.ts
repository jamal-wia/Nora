import {
  POSTS_PER_PAGE,
  POSTS_SHOWN_WITHOUT_LOGIN,
  buildProfileSearchPageUrl,
  continuePosts,
  toEmbedUrl,
  toInstagramPost,
  type PublicPost,
  type SearchResult,
} from './public-posts'

export interface MorePostCard {
  url: string
  embedUrl: string
  date: number | null
  likes: string | null
  comments: string | null
  caption: string
}

export interface MorePostsPayload {
  username: string
  page: number
  /** `idle`: nothing has been searched for yet, and the list offers to. */
  status: 'idle' | 'ok' | 'error'
  posts: MorePostCard[]
  hasMore: boolean
  /** DuckDuckGo's page for the search, which the page asks the app to open. */
  searchUrl: string | null
}

const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; posts: PublicPost[] }>()

/**
 * One page of what to show below a profile, from what a search found. Nothing is searched for
 * here: the person asks for that, and what it finds is kept for a while so that showing more
 * reads from it. Until then, and once it has gone stale, the list offers to search.
 */
export function getMorePostsPage(username: string, page: number, now = Date.now()): MorePostsPayload {
  const searchUrl = buildProfileSearchPageUrl(username)
  const entry = cache.get(username.toLowerCase())
  if (!entry || now - entry.at > CACHE_TTL_MS) {
    return { username, page, status: 'idle', posts: [], hasMore: false, searchUrl }
  }

  const start = Math.max(0, page) * POSTS_PER_PAGE
  const cards: MorePostCard[] = []
  for (const post of entry.posts.slice(start, start + POSTS_PER_PAGE)) {
    const embedUrl = toEmbedUrl(post)
    if (embedUrl) {
      cards.push({ url: post.url, embedUrl, date: post.date, likes: post.likes, comments: post.comments, caption: post.caption })
    }
  }
  return { username, page, status: 'ok', posts: cards, hasMore: start + POSTS_PER_PAGE < entry.posts.length, searchUrl }
}

/** What the search found for a profile, read in the same way for any way of getting it. */
export function storeSearchResults(username: string, results: SearchResult[], now = Date.now()) {
  const posts = results.map((result) => toInstagramPost(result, username)).filter((post): post is PublicPost => post !== null)
  // The newest are the ones the profile already shows, whose codes the page does not give.
  cache.set(username.toLowerCase(), { at: now, posts: continuePosts(posts, []).slice(POSTS_SHOWN_WITHOUT_LOGIN) })
}

// The tab of a search page opened for a profile, and the tab it was opened from, which is where
// the posts found go.
const searchTabs = new Map<string, { parentTabId: string; username: string }>()

export const registerSearchTab = (tabId: string, parentTabId: string, username: string) =>
  searchTabs.set(tabId, { parentTabId, username })

export const peekSearchTab = (tabId: string) => searchTabs.get(tabId)

export function takeSearchTab(tabId: string) {
  const entry = searchTabs.get(tabId)
  searchTabs.delete(tabId)
  return entry
}

export function clearMorePostsCache() {
  cache.clear()
  searchTabs.clear()
}
