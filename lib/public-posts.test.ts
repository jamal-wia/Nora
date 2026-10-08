import { describe, expect, it } from 'bun:test'
import {
  buildProfileSearchPageUrl,
  getSearchPageUsername,
  buildProfileSearchQuery,
  continuePosts,
  fetchProfilePosts,
  isChallengePage,
  parseNextPageForm,
  parseSearchResults,
  toInstagramPost,
  unwrapResultUrl,
  type PublicPost,
} from './public-posts'

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

const nextForm = `
<div class="nav-link">
  <form action="/html/" method="post">
    <input type="submit" class='btn btn--alt' value="Next" />
    <input type="hidden" name="q" value="site:instagram.com/nasa/" />
    <input type="hidden" name="s" value="10" />
    <input type="hidden" name="nextParams" value="" />
    <input type="hidden" name="vqd" value="4-123" />
  </form>
</div>`

const response = (html: string, ok = true) => ({ ok, text: async () => html })

describe('profile search', () => {
  it('searches only for something that can be a profile name', () => {
    expect(buildProfileSearchQuery('nasa')).toBe('site:instagram.com/nasa/')
    expect(buildProfileSearchQuery('nasa.gov_1')).toBe('site:instagram.com/nasa.gov_1/')
    expect(buildProfileSearchQuery('nasa site:evil.com')).toBeNull()
    expect(buildProfileSearchQuery('')).toBeNull()
    expect(buildProfileSearchQuery('a'.repeat(31))).toBeNull()
  })

  it('builds the page a person can open', () => {
    expect(buildProfileSearchPageUrl('nasa')).toBe('https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2Fnasa%2F')
    expect(buildProfileSearchPageUrl('a b')).toBeNull()
  })
})

describe('getSearchPageUsername', () => {
  it('is the profile a search page was built for', () => {
    expect(getSearchPageUsername(buildProfileSearchPageUrl('nasa')!)).toBe('nasa')
    expect(getSearchPageUsername(buildProfileSearchPageUrl('nasa.gov_1')!)).toBe('nasa.gov_1')
  })

  it('is null for any other address', () => {
    expect(getSearchPageUsername('https://html.duckduckgo.com/html/?q=hello')).toBeNull()
    expect(getSearchPageUsername('https://duckduckgo.com/?q=site%3Ainstagram.com%2Fnasa%2F')).toBeNull()
    expect(getSearchPageUsername('https://evil.net/html/?q=site%3Ainstagram.com%2Fnasa%2F')).toBeNull()
    expect(getSearchPageUsername('nope')).toBeNull()
  })
})

describe('isChallengePage', () => {
  it('recognises a page that asks for proof of a person', () => {
    expect(isChallengePage('<form id="challenge-form"><div class="anomaly-modal">Select all squares</div></form>')).toBe(true)
  })

  it('does not take a page with results for one', () => {
    expect(isChallengePage(page)).toBe(false)
  })

  it('does not take an empty result page for one', () => {
    expect(isChallengePage('<html><body>No results found.</body></html>')).toBe(false)
  })
})

describe('parseNextPageForm', () => {
  it('reads the hidden fields the Next button sends', () => {
    const body = parseNextPageForm(page + nextForm)!
    expect(body.get('q')).toBe('site:instagram.com/nasa/')
    expect(body.get('s')).toBe('10')
    expect(body.get('vqd')).toBe('4-123')
    expect(body.has('nextParams')).toBe(true)
  })

  it('is null on the last page', () => {
    expect(parseNextPageForm(page)).toBeNull()
  })
})

describe('fetchProfilePosts', () => {
  it('returns the posts not yet shown, newest first', async () => {
    const result = await fetchProfilePosts('nasa', ['DWwjA6qFG8G'], async () => response(page))
    expect(result).toEqual({ status: 'ok', posts: [expect.objectContaining({ shortcode: 'DbbSK7rD-SW' })] })
  })

  it('follows the Next button for a few pages and no further', async () => {
    const urls: string[] = []
    const result = await fetchProfilePosts('nasa', [], async (url, init) => {
      urls.push(`${init?.method || 'GET'} ${url}`)
      return response(page + nextForm)
    })
    expect(urls).toHaveLength(3)
    expect(urls[0]).toStartWith('GET https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2Fnasa%2F')
    expect(urls[1]).toBe('POST https://html.duckduckgo.com/html/')
    expect(result.status).toBe('ok')
  })

  it('stops at a check and says so, without answering it', async () => {
    let calls = 0
    const result = await fetchProfilePosts('nasa', [], async () => {
      calls++
      return response('<div class="anomaly-modal">challenge-form</div>')
    })
    expect(result).toEqual({ status: 'challenge' })
    expect(calls).toBe(1)
  })

  it('reports an error when the first request fails, and keeps what it has when a later one does', async () => {
    expect(await fetchProfilePosts('nasa', [], async () => response('', false))).toEqual({ status: 'error' })
    expect(
      await fetchProfilePosts('nasa', [], async () => {
        throw new Error('offline')
      }),
    ).toEqual({ status: 'error' })

    let calls = 0
    const partial = await fetchProfilePosts('nasa', [], async () => (++calls === 1 ? response(page + nextForm) : response('', false)))
    expect(partial.status).toBe('ok')
    expect(partial.status === 'ok' && partial.posts.length).toBe(2)
  })

  it('does not search for a name that is not a profile name', async () => {
    let calls = 0
    const result = await fetchProfilePosts('nasa site:evil.com', [], async () => {
      calls++
      return response(page)
    })
    expect(result).toEqual({ status: 'error' })
    expect(calls).toBe(0)
  })
})
