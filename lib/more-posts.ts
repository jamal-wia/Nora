import {
  POSTS_PER_PAGE,
  POSTS_SHOWN_WITHOUT_LOGIN,
  buildProfileSearchPageUrl,
  fetchProfilePosts,
  toEmbedUrl,
  type PublicPostsResult,
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
}
