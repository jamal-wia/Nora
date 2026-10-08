import { describe, expect, it } from 'bun:test'
import { continuePosts, parseSearchResults, toInstagramPost, unwrapResultUrl, type PublicPost } from './public-posts'

// The shape of a real result page of html.duckduckgo.com, cut down to three results.
const page = `
<div id="links" class="results">
  <div class="result results_links results_links_deep web-result ">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.instagram.com%2Fnasa%2Freels%2F&amp;rut=aa">NASA (@nasa) • Instagram photos and videos</a>
      </h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.instagram.com%2Fnasa%2Freels%2F&amp;rut=aa">104M Followers, 94 Following, 4,955 Posts - NASA (@nasa) on Instagram: &quot;Making the seemingly impossible, possible. &quot;</a>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result ">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.instagram.com%2Fnasa%2Freel%2FDbbSK7rD%2DSW%2F&amp;rut=bb">NASA on Instagram</a>
      </h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.instagram.com%2Fnasa%2Freel%2FDbbSK7rD%2DSW%2F&amp;rut=bb">160K likes, 1,187 comments - nasa on July 30, 2026: &quot;We&#x27;re about to see the bigger picture. 🌌 On Aug. 30, our telescope will lift off ...</a>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result ">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww%2Dfallback.instagram.com%2Fnasa%2Fp%2FDWwjA6qFG8G%2F&amp;rut=cc">NASA on Instagram</a>
      </h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww%2Dfallback.instagram.com%2Fnasa%2Fp%2FDWwjA6qFG8G%2F&amp;rut=cc">2M likes, 8,744 comments - nasa on April 5, 2026: &quot;Unbeatable aura Swipe right to meet our astronauts! ...</a>
    </div>
  </div>
</div>`

const post = (shortcode: string, date: number | null): PublicPost => ({
  url: `https://www.instagram.com/nasa/p/${shortcode}/`,
  shortcode,
  date,
  likes: null,
  comments: null,
  caption: '',
})

describe('unwrapResultUrl', () => {
  it('reads the real address out of the redirect', () => {
    expect(unwrapResultUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.instagram.com%2Fnasa%2Fp%2Fabc%2F&amp;rut=1')).toBe(
      'https://www.instagram.com/nasa/p/abc/',
    )
  })

  it('keeps an address that is not wrapped', () => {
    expect(unwrapResultUrl('https://example.com/a')).toBe('https://example.com/a')
  })
})

describe('parseSearchResults', () => {
  it('reads every result with its address, title and description', () => {
    const results = parseSearchResults(page)
    expect(results.map((result) => result.url)).toEqual([
      'https://www.instagram.com/nasa/reels/',
      'https://www.instagram.com/nasa/reel/DbbSK7rD-SW/',
      'https://www-fallback.instagram.com/nasa/p/DWwjA6qFG8G/',
    ])
    expect(results[1].title).toBe('NASA on Instagram')
    expect(results[1].snippet).toContain('160K likes, 1,187 comments - nasa on July 30, 2026: "We\'re about to see')
  })

  it('gives nothing for a page without results', () => {
    expect(parseSearchResults('<html><body>No results.</body></html>')).toEqual([])
  })
})

describe('toInstagramPost', () => {
  const [profile, reel, photo] = parseSearchResults(page)

  it('reads a reel and a post, with date, counts and caption', () => {
    expect(toInstagramPost(reel, 'nasa')).toEqual({
      url: 'https://www.instagram.com/nasa/reel/DbbSK7rD-SW/',
      shortcode: 'DbbSK7rD-SW',
      date: Date.UTC(2026, 6, 30),
      likes: '160K',
      comments: '1,187',
      caption: expect.stringContaining("We're about to see the bigger picture."),
    })
    expect(toInstagramPost(photo, 'nasa')).toMatchObject({ shortcode: 'DWwjA6qFG8G', date: Date.UTC(2026, 3, 5), likes: '2M' })
  })

  it('skips the profile page and other things that are not a post', () => {
    expect(toInstagramPost(profile, 'nasa')).toBeNull()
    expect(toInstagramPost({ url: 'https://www.instagram.com/nasa/embed/', title: '', snippet: '' }, 'nasa')).toBeNull()
    expect(toInstagramPost({ url: 'https://example.com/nasa/p/abc/', title: '', snippet: '' }, 'nasa')).toBeNull()
    expect(toInstagramPost({ url: 'not a url', title: '', snippet: '' }, 'nasa')).toBeNull()
  })

  it('skips the posts of another account', () => {
    expect(toInstagramPost({ url: 'https://www.instagram.com/other/p/abc/', title: '', snippet: '1 likes, 2 comments - other on May 1, 2026: "x"' }, 'nasa')).toBeNull()
  })

  it('takes a profile-less link only when the description names the profile', () => {
    const mine = { url: 'https://www.instagram.com/p/abc/', title: '', snippet: '1K likes, 2 comments - nasa on May 1, 2026: "x"' }
    const theirs = { url: 'https://www.instagram.com/p/abc/', title: '', snippet: '1K likes, 2 comments - other on May 1, 2026: "x"' }
    expect(toInstagramPost(mine, 'nasa')).toMatchObject({ shortcode: 'abc' })
    expect(toInstagramPost(theirs, 'nasa')).toBeNull()
  })

  it('keeps a post with no date, with no date', () => {
    const undated = toInstagramPost({ url: 'https://www.instagram.com/nasa/p/abc/', title: '', snippet: 'nasa on Instagram' }, 'nasa')
    expect(undated).toMatchObject({ shortcode: 'abc', date: null })
  })

  it('does not take an impossible date', () => {
    const odd = toInstagramPost({ url: 'https://www.instagram.com/nasa/p/abc/', title: '', snippet: '1 likes, 2 comments - nasa on Foo 3, 2026: "x"' }, 'nasa')
    expect(odd!.date).toBeNull()
  })
})

describe('continuePosts', () => {
  it('leaves out what the page already shows', () => {
    expect(continuePosts([post('a', 1), post('b', 2)], ['a']).map((p) => p.shortcode)).toEqual(['b'])
  })

  it('lists each post once', () => {
    expect(continuePosts([post('a', 1), post('a', 1)], []).map((p) => p.shortcode)).toEqual(['a'])
  })

  it('puts the newest first and the undated last', () => {
    expect(continuePosts([post('old', 1), post('none', null), post('new', 3), post('mid', 2), post('none2', null)], []).map((p) => p.shortcode)).toEqual([
      'new',
      'mid',
      'old',
      'none',
      'none2',
    ])
  })
})
