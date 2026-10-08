import {
  POSTS_PER_PAGE,
  POSTS_SHOWN_WITHOUT_LOGIN,
  buildProfileSearchPageUrl,
  continuePosts,
  fetchProfilePosts,
  toEmbedUrl,
  toInstagramPost,
  type PublicPost,
  type PublicPostsResult,
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
  status: 'ok' | 'challenge' | 'error'
  posts: MorePostCard[]
  hasMore: boolean
  /** DuckDuckGo's own page for the same search, for when the person has to deal with a check there. */
  searchUrl: string | null
}

const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; result: PublicPostsResult }>()

type FetchPosts = typeof fetchProfilePosts

/**
 * The results a person's own visit to the search page found, for a profile whose search the app
 * could not run itself. Read in the same way and kept in the same place, so the list continues
 * from them as from any other.
 */
export function storeSearchResults(username: string, results: SearchResult[], now = Date.now()) {
  const posts = results.map((result) => toInstagramPost(result, username)).filter((post): post is PublicPost => post !== null)
  // The newest are the ones the profile already shows, whose codes the page does not give.
  const rest = continuePosts(posts, []).slice(POSTS_SHOWN_WITHOUT_LOGIN)
  cache.set(username.toLowerCase(), { at: now, result: { status: 'ok', posts: rest } })
}

// The tab of a search page opened for a profile, and the tab it was opened from, which is where
// the posts found go.
const searchTabs = new Map<string, { parentTabId: string; username: string }>()

export const registerSearchTab = (tabId: string, parentTabId: string, username: string) =>
  searchTabs.set(tabId, { parentTabId, username })

export function takeSearchTab(tabId: string) {
  const entry = searchTabs.get(tabId)
  searchTabs.delete(tabId)
  return entry
}

/**
 * One page of what to show below a profile. The search runs once per profile and
 * is kept for a while, so showing more posts reads from it instead of asking the
 * search engine again. A check or an error is not kept: asking again later is the
 * person's call.
 */
export async function getMorePostsPage(
  username: string,
  page: number,
  now = Date.now(),
  fetchPosts: FetchPosts = fetchProfilePosts,
): Promise<MorePostsPayload> {
  const key = username.toLowerCase()
  const searchUrl = buildProfileSearchPageUrl(username)
  let entry = cache.get(key)
  if (!entry || now - entry.at > CACHE_TTL_MS) {
    // The newest are the ones the profile already shows, whose codes the page does not give.
    const result = await fetchPosts(username, [])
    if (result.status !== 'ok') {
      return { username, page, status: result.status, posts: [], hasMore: false, searchUrl }
    }
    entry = { at: now, result: { status: 'ok', posts: result.posts.slice(POSTS_SHOWN_WITHOUT_LOGIN) } }
    cache.set(key, entry)
  }

  const posts = entry.result.status === 'ok' ? entry.result.posts : []
  const start = Math.max(0, page) * POSTS_PER_PAGE
  const cards: MorePostCard[] = []
  for (const post of posts.slice(start, start + POSTS_PER_PAGE)) {
    const embedUrl = toEmbedUrl(post)
    if (embedUrl) {
      cards.push({ url: post.url, embedUrl, date: post.date, likes: post.likes, comments: post.comments, caption: post.caption })
    }
  }
  return { username, page, status: 'ok', posts: cards, hasMore: start + POSTS_PER_PAGE < posts.length, searchUrl }
}

export function clearMorePostsCache() {
  cache.clear()
  searchTabs.clear()
}
