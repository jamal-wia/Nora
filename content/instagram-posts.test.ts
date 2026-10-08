import { describe, expect, it } from 'bun:test'
import { getEmbedUrlForPage, getMediaId, getPostUrl, isProfileGridPage, isWatchAgainLink, toShortcode } from './instagram-posts'

const picture = (key: string) =>
  `https://instagram.fcai20-1.fna.fbcdn.net/v/t51.82787-15/1.jpg?stp=dst-jpg&ig_cache_key=${encodeURIComponent(key)}&_nc_ohc=x`

describe('getMediaId', () => {
  it('reads the id of a post out of its picture', () => {
    expect(getMediaId(picture('NDAwMjE0NzA1MDA1Nzc3MTYwMw==.3-ccb7-5'))).toBe('4002147050057771603')
  })

  it('leaves the id of the account off when it follows the id', () => {
    expect(getMediaId(picture(btoa('400345017218766435417905473144663003')))).toBe('4003450172187664354')
  })

  it('is null for a picture that is not a post', () => {
    expect(getMediaId('https://scontent.cdninstagram.com/profile.jpg?stp=dst-jpg')).toBeNull()
    expect(getMediaId(picture('not base64 !!'))).toBeNull()
    expect(getMediaId(picture(btoa('abc')))).toBeNull()
    expect(getMediaId('nope')).toBeNull()
  })
})

describe('toShortcode', () => {
  // Checked against the post it names on instagram.com.
  it('writes an id the way the address of a post does', () => {
    expect(toShortcode('4002147050057771603')).toBe('DeKe4mpkipT')
  })

  it('refuses what is not an id', () => {
    expect(toShortcode('')).toBeNull()
    expect(toShortcode('12ab')).toBeNull()
    expect(toShortcode('99999999999999999999')).toBeNull()
    expect(toShortcode('0')).toBeNull()
  })
})

describe('getPostUrl', () => {
  it('is the address of the post a picture belongs to', () => {
    expect(getPostUrl(picture('NDAwMjE0NzA1MDA1Nzc3MTYwMw==.3-ccb7-5'))).toBe('https://www.instagram.com/p/DeKe4mpkipT/')
  })

  it('is null for a picture of nothing in particular', () => {
    expect(getPostUrl('https://example.com/a.jpg')).toBeNull()
  })
})

describe('isProfileGridPage', () => {
  it('is a profile and its tabs', () => {
    expect(isProfileGridPage('www.instagram.com', '/nasa/')).toBe(true)
    expect(isProfileGridPage('www.instagram.com', '/nasa')).toBe(true)
    expect(isProfileGridPage('www.instagram.com', '/nasa/reels/')).toBe(true)
    expect(isProfileGridPage('www.instagram.com', '/nasa/tagged/')).toBe(true)
  })

  it('is nothing else', () => {
    expect(isProfileGridPage('www.instagram.com', '/')).toBe(false)
    expect(isProfileGridPage('www.instagram.com', '/explore/')).toBe(false)
    expect(isProfileGridPage('www.instagram.com', '/p/abc/')).toBe(false)
    expect(isProfileGridPage('www.facebook.com', '/nasa/')).toBe(false)
  })
})

describe('getEmbedUrlForPage', () => {
  it('is the embed page of a post, a reel or a video', () => {
    expect(getEmbedUrlForPage('www.instagram.com', '/p/DeKe4mpkipT/')).toBe('https://www.instagram.com/p/DeKe4mpkipT/embed/')
    expect(getEmbedUrlForPage('www.instagram.com', '/reel/DeKe4mpkipT')).toBe('https://www.instagram.com/reel/DeKe4mpkipT/embed/')
    expect(getEmbedUrlForPage('www.instagram.com', '/tv/DeKe4mpkipT/')).toBe('https://www.instagram.com/tv/DeKe4mpkipT/embed/')
  })

  it('also for the address a profile gives its post', () => {
    expect(getEmbedUrlForPage('www.instagram.com', '/artefr/reel/DeKe4mpkipT/')).toBe(
      'https://www.instagram.com/reel/DeKe4mpkipT/embed/',
    )
    expect(getEmbedUrlForPage('instagram.com', '/nasa.gov/p/DeKe4mpkipT/')).toBe('https://www.instagram.com/p/DeKe4mpkipT/embed/')
  })

  it('is nothing for the embed page, a profile or any other page', () => {
    expect(getEmbedUrlForPage('www.instagram.com', '/p/DeKe4mpkipT/embed/')).toBeNull()
    expect(getEmbedUrlForPage('www.instagram.com', '/artefr/')).toBeNull()
    expect(getEmbedUrlForPage('www.instagram.com', '/reels/')).toBeNull()
    expect(getEmbedUrlForPage('www.instagram.com', '/p/abc/')).toBeNull()
    expect(getEmbedUrlForPage('www.instagram.com', '/accounts/login/')).toBeNull()
  })

  it('is nothing on another site, or on one that only looks like Instagram', () => {
    expect(getEmbedUrlForPage('www.facebook.com', '/p/DeKe4mpkipT/')).toBeNull()
    expect(getEmbedUrlForPage('instagram.com.evil.net', '/p/DeKe4mpkipT/')).toBeNull()
  })
})

describe('isWatchAgainLink', () => {
  it('is the link an embed page puts over a video that has ended', () => {
    expect(isWatchAgainLink('https://www.instagram.com/p/DeOjrIyjznF/?utm_source=ig_embed&utm_campaign=embed_video_watch_again')).toBe(true)
    expect(isWatchAgainLink('https://www.instagram.com/p/DeOjrIyjznF/?utm_campaign=embed_video_watch_again&igsh=x')).toBe(true)
  })

  it('is no other link of the page', () => {
    expect(isWatchAgainLink('https://www.instagram.com/p/DeOjrIyjznF/?utm_source=ig_embed&utm_campaign=loggedout')).toBe(false)
    expect(isWatchAgainLink('https://www.instagram.com/artefr/')).toBe(false)
    expect(isWatchAgainLink(null)).toBe(false)
    expect(isWatchAgainLink('')).toBe(false)
  })
})
