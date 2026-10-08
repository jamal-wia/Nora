import { beforeEach, describe, expect, it } from 'bun:test'
import {
  clearMorePostsCache,
  getMorePostsPage,
  peekSearchTab,
  registerSearchTab,
  storeSearchResults,
  takeSearchTab,
} from './more-posts'
import { POSTS_PER_PAGE, POSTS_SHOWN_WITHOUT_LOGIN, toEmbedUrl } from './public-posts'

const result = (code: string, day: number) => ({
  url: `https://www.instagram.com/nasa/p/${code}/`,
  title: 'NASA on Instagram',
  snippet: `1K likes, 2 comments - nasa on May ${day}, 2026: "post ${code}"`,
})

const results = (count: number) => Array.from({ length: count }, (_, index) => result(`code${String(index).padStart(3, '0')}`, (index % 28) + 1))

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
  it('offers to search until something has been searched for, and searches nothing itself', () => {
    expect(getMorePostsPage('nasa', 0, 0)).toEqual({
      username: 'nasa',
      page: 0,
      status: 'idle',
      posts: [],
      hasMore: false,
      searchUrl: 'https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2Fnasa%2F',
    })
  })

  it('leaves out the posts the profile already shows and pages the rest', () => {
    storeSearchResults('nasa', results(POSTS_SHOWN_WITHOUT_LOGIN + POSTS_PER_PAGE + 5), 0)
    const first = getMorePostsPage('nasa', 0, 1)
    expect(first.status).toBe('ok')
    expect(first.posts).toHaveLength(POSTS_PER_PAGE)
    expect(first.hasMore).toBe(true)

    const second = getMorePostsPage('nasa', 1, 1)
    expect(second.posts).toHaveLength(5)
    expect(second.hasMore).toBe(false)
  })

  it('keeps what was found for any spelling of the name', () => {
    storeSearchResults('NASA', results(POSTS_SHOWN_WITHOUT_LOGIN + 3), 0)
    expect(getMorePostsPage('nasa', 0, 1).posts).toHaveLength(3)
  })

  it('offers to search again once what was found is old', () => {
    storeSearchResults('nasa', results(POSTS_SHOWN_WITHOUT_LOGIN + 3), 0)
    expect(getMorePostsPage('nasa', 0, 11 * 60 * 1000).status).toBe('idle')
  })

  it('says there is nothing more when the search found no more than the profile shows', () => {
    storeSearchResults('nasa', results(POSTS_SHOWN_WITHOUT_LOGIN), 0)
    expect(getMorePostsPage('nasa', 0, 1)).toMatchObject({ status: 'ok', posts: [], hasMore: false })
  })

  it('puts the newest first, after the twelve newest', () => {
    const dated = (code: string, year: number) => ({ ...result(code, 1), snippet: `1K likes, 2 comments - nasa on May 1, ${year}: "post ${code}"` })
    const newest = Array.from({ length: POSTS_SHOWN_WITHOUT_LOGIN }, (_, index) => dated(`top${index}`, 2030 + index))
    storeSearchResults('nasa', [dated('old', 2001), ...newest, dated('new', 2003), dated('mid', 2002)], 0)
    expect(getMorePostsPage('nasa', 0, 1).posts.map((post) => post.caption)).toEqual(['post new', 'post mid', 'post old'])
  })
})

describe('storeSearchResults', () => {
  it('ignores results that are not posts of the profile', () => {
    storeSearchResults('nasa', [result('abcde', 1), { url: 'https://example.com/', title: '', snippet: '' }], 0)
    expect(getMorePostsPage('nasa', 0, 1)).toMatchObject({ status: 'ok', posts: [], hasMore: false })
  })
})

describe('search tabs', () => {
  it('remembers the tab a search page was opened from, until it is taken', () => {
    registerSearchTab('search-tab', 'profile-tab', 'nasa')
    expect(peekSearchTab('search-tab')).toEqual({ parentTabId: 'profile-tab', username: 'nasa' })
    expect(takeSearchTab('search-tab')).toEqual({ parentTabId: 'profile-tab', username: 'nasa' })
    expect(takeSearchTab('search-tab')).toBeUndefined()
    expect(peekSearchTab('search-tab')).toBeUndefined()
  })

  it('knows nothing of a tab it did not open', () => {
    expect(takeSearchTab('other-tab')).toBeUndefined()
  })
})
