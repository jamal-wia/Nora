import { describe, expect, it } from 'bun:test'
import { getMediaId, getPostUrl, isProfileGridPage, toShortcode } from './instagram-posts'

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
