import { beforeEach, describe, expect, it } from 'bun:test'
import { clearMorePostsCache, getMorePostsPage, registerSearchTab, storeSearchResults, takeSearchTab } from './more-posts'
import { POSTS_PER_PAGE, POSTS_SHOWN_WITHOUT_LOGIN, toEmbedUrl, type PublicPost, type PublicPostsResult } from './public-posts'

const posts = (count: number): PublicPost[] =>
  Array.from({ length: count }, (_, index) => ({
    url: `https://www.instagram.com/nasa/p/code${index}/`,
    shortcode: `code${index}`,
    date: 1_000_000 - index,
    likes: '1K',
    comments: '2',
    caption: `post ${index}`,
  }))

const fetcher = (result: PublicPostsResult) => {
  const calls = { count: 0 }
  return {
    calls,
    fetchPosts: async () => {
      calls.count++
      return result
    },
  }
}

beforeEach(() => clearMorePostsCache())

describe('toEmbedUrl', () => {
  it('points at the embed page of a post or a reel', () => {
    expect(toEmbedUrl({ url: 'https://www.instagram.com/nasa/p/abc-D_1/' })).toBe('https://www.instagram.com/p/abc-D_1/embed/')
    expect(toEmbedUrl({ url: 'https://www.instagram.com/nasa/reel/xyz/' })).toBe('https://www.instagram.com/reel/xyz/embed/')
    expect(toEmbedUrl({ url: 'https://www-fallback.instagram.com/nasa/p/abc/' })).toBe('https://www.instagram.com/p/abc/embed/')
  })

  it('refuses anything else', () => {
    expect(toEmbedUrl({ url: 'https://example.com/nasa/p/abc/' })).toBeNull()
    expect(toEmbedUrl({ url: 'https://www.instagram.com/nasa/' })).toBeNull()
    expect(toEmbedUrl({ url: 'nope' })).toBeNull()
  })
})

describe('getMorePostsPage', () => {
  it('leaves out the posts the profile already shows and pages the rest', async () => {
    const { fetchPosts } = fetcher({ status: 'ok', posts: posts(POSTS_SHOWN_WITHOUT_LOGIN + POSTS_PER_PAGE + 5) })
    const first = await getMorePostsPage('nasa', 0, 0, fetchPosts)
    expect(first.status).toBe('ok')
    expect(first.posts).toHaveLength(POSTS_PER_PAGE)
    expect(first.posts[0].caption).toBe(`post ${POSTS_SHOWN_WITHOUT_LOGIN}`)
    expect(first.hasMore).toBe(true)

    const second = await getMorePostsPage('nasa', 1, 0, fetchPosts)
    expect(second.posts).toHaveLength(5)
    expect(second.hasMore).toBe(false)
  })

  it('searches once per profile and reads later pages from what it kept', async () => {
    const { fetchPosts, calls } = fetcher({ status: 'ok', posts: posts(60) })
    await getMorePostsPage('nasa', 0, 0, fetchPosts)
    await getMorePostsPage('NASA', 1, 1000, fetchPosts)
    expect(calls.count).toBe(1)
  })

  it('searches again once what it kept is old', async () => {
    const { fetchPosts, calls } = fetcher({ status: 'ok', posts: posts(60) })
    await getMorePostsPage('nasa', 0, 0, fetchPosts)
    await getMorePostsPage('nasa', 1, 11 * 60 * 1000, fetchPosts)
    expect(calls.count).toBe(2)
  })

  it('hands over the search page when there is a check, and does not keep it', async () => {
    const { fetchPosts, calls } = fetcher({ status: 'challenge' })
    const result = await getMorePostsPage('nasa', 0, 0, fetchPosts)
    expect(result).toMatchObject({ status: 'challenge', posts: [], hasMore: false, searchUrl: 'https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2Fnasa%2F' })
    await getMorePostsPage('nasa', 0, 1, fetchPosts)
    expect(calls.count).toBe(2)
  })

  it('reports an error with the search page to fall back to', async () => {
    const { fetchPosts } = fetcher({ status: 'error' })
    expect(await getMorePostsPage('nasa', 0, 0, fetchPosts)).toMatchObject({ status: 'error', posts: [] })
  })

  it('shows nothing, and says it is fine, when the search found no more than the profile shows', async () => {
    const { fetchPosts } = fetcher({ status: 'ok', posts: posts(POSTS_SHOWN_WITHOUT_LOGIN) })
    expect(await getMorePostsPage('nasa', 0, 0, fetchPosts)).toMatchObject({ status: 'ok', posts: [], hasMore: false })
  })
})

describe('storeSearchResults', () => {
  const result = (code: string, day: number) => ({
    url: `https://www.instagram.com/nasa/p/${code}/`,
    title: 'NASA on Instagram',
    snippet: `1K likes, 2 comments - nasa on May ${day}, 2026: "post ${code}"`,
  })

  it('keeps what a visit to the search page found, newest first and without the first twelve', async () => {
    const results = Array.from({ length: 15 }, (_, index) => result(`code${String(index).padStart(2, '0')}`, index + 1))
    storeSearchResults('nasa', results, 0)
    let calls = 0
    const page = await getMorePostsPage('nasa', 0, 1, async () => {
      calls++
      return { status: 'error' }
    })
    expect(calls).toBe(0)
    expect(page.posts.map((post) => post.caption)).toEqual(['post code02', 'post code01', 'post code00'])
  })

  it('ignores results that are not posts of the profile', async () => {
    storeSearchResults('nasa', [result('abcde', 1), { url: 'https://example.com/', title: '', snippet: '' }], 0)
    const page = await getMorePostsPage('nasa', 0, 1, async () => ({ status: 'error' }))
    expect(page).toMatchObject({ status: 'ok', posts: [], hasMore: false })
  })
})

describe('search tabs', () => {
  it('remembers the tab a search page was opened from, once', () => {
    registerSearchTab('search-tab', 'profile-tab', 'nasa')
    expect(takeSearchTab('search-tab')).toEqual({ parentTabId: 'profile-tab', username: 'nasa' })
    expect(takeSearchTab('search-tab')).toBeUndefined()
  })

  it('knows nothing of a tab it did not open', () => {
    expect(takeSearchTab('other-tab')).toBeUndefined()
  })
})
