import { describe, expect, it } from 'bun:test'
import * as cheerio from 'cheerio'
import { findOverlayTarget, findPortalTarget, getAnonymousCss } from './anonymous'
import { anonymousRules, getAnonymousRules, type AnonymousRule } from './anonymous-rules'

const rules: AnonymousRule[] = [
  { hosts: ['example.com'], hide: ['.promo', '#banner'], overlays: ['div[role="dialog"]'] },
  { hosts: ['other.org'], hide: ['.other'] },
]

describe('getAnonymousRules', () => {
  it('matches a host and its subdomains', () => {
    expect(getAnonymousRules('example.com', rules)).toHaveLength(1)
    expect(getAnonymousRules('www.example.com', rules)).toHaveLength(1)
    expect(getAnonymousRules('m.example.com', rules)).toHaveLength(1)
  })

  it('does not match a site that merely ends in the same letters', () => {
    expect(getAnonymousRules('notexample.com', rules)).toHaveLength(0)
    expect(getAnonymousRules('example.com.evil.net', rules)).toHaveLength(0)
  })

  it('knows the sites it ships rules for', () => {
    for (const host of ['x.com', 'm.facebook.com', 'www.instagram.com', 'www.threads.com', 'www.tumblr.com']) {
      expect(getAnonymousRules(host).length).toBeGreaterThan(0)
    }
    expect(getAnonymousRules('example.com')).toHaveLength(0)
  })
})

describe('getAnonymousCss', () => {
  it('is empty while the mode is off', () => {
    expect(getAnonymousCss('example.com', false, rules)).toBe('')
  })

  it('is empty for a site with no rules', () => {
    expect(getAnonymousCss('unknown.net', true, rules)).toBe('')
  })

  it('gives every selector a rule of its own', () => {
    const css = getAnonymousCss('example.com', true, rules)
    expect(css).toContain('.promo { display: none !important; }')
    expect(css).toContain('#banner { display: none !important; }')
    expect(css).not.toContain('.promo, #banner')
  })

  it('only uses the rules of the site it is for', () => {
    expect(getAnonymousCss('example.com', true, rules)).not.toContain('.other')
  })

  it('hides what the script marked and unlocks scrolling only after it marked something', () => {
    const css = getAnonymousCss('example.com', true, rules)
    expect(css).toContain('[data-nora-anonymous-hidden] { display: none !important; }')
    expect(css).toContain('html[data-nora-anonymous-prompt] body { overflow: auto !important; }')
  })
})

interface FakeNode {
  tagName: string
  parentElement: FakeNode | null
  floating?: boolean
}

// Outermost node first; returns the innermost one, which is what a selector matches.
const chain = (...nodes: Omit<FakeNode, 'parentElement'>[]) => {
  let node: FakeNode | null = null
  for (const next of nodes) {
    node = { ...next, parentElement: node }
  }
  return node as FakeNode
}
const isFloating = (node: FakeNode) => Boolean(node.floating)

describe('findOverlayTarget', () => {
  it('takes the outermost floating ancestor, so the backdrop goes with the prompt', () => {
    const match = chain(
      { tagName: 'BODY' },
      { tagName: 'DIV' },
      { tagName: 'DIV', floating: true },
      { tagName: 'DIV' },
      { tagName: 'DIV', floating: true },
      { tagName: 'DIV' },
    )
    const target = findOverlayTarget(match, isFloating)!
    expect(target.floating).toBe(true)
    expect(target.parentElement!.floating).toBeUndefined()
    expect(target.parentElement!.tagName).toBe('DIV')
    expect(target.parentElement!.parentElement!.tagName).toBe('BODY')
  })

  it('leaves a match that is part of the page', () => {
    const match = chain({ tagName: 'BODY' }, { tagName: 'DIV' }, { tagName: 'BUTTON' })
    expect(findOverlayTarget(match, isFloating)).toBeNull()
  })

  it('does not climb out of the body', () => {
    const match = chain({ tagName: 'HTML', floating: true }, { tagName: 'BODY', floating: true }, { tagName: 'DIV' })
    expect(findOverlayTarget(match, isFloating)).toBeNull()
  })

  it('takes the match itself when it is the floating one', () => {
    const match = chain({ tagName: 'BODY' }, { tagName: 'DIV', floating: true })
    expect(findOverlayTarget(match, isFloating)).toBe(match)
  })
})

describe('findPortalTarget', () => {
  const text = (node: FakeNode & { text?: number }) => node.text ?? 0

  it('takes the container directly under the body when it holds little but the prompt', () => {
    const match = chain(
      { tagName: 'BODY' },
      { tagName: 'DIV', text: 150 } as never,
      { tagName: 'DIV' },
      { tagName: 'DIV', text: 120 } as never,
    )
    const target = findPortalTarget(match, text)!
    expect(target.parentElement!.tagName).toBe('BODY')
  })

  it('refuses a container that is the app and not just the prompt', () => {
    const match = chain({ tagName: 'BODY' }, { tagName: 'DIV', text: 50_000 } as never, { tagName: 'DIV', text: 120 } as never)
    expect(findPortalTarget(match, text)).toBeNull()
  })

  it('takes the match itself when it is directly under the body', () => {
    const match = chain({ tagName: 'BODY' }, { tagName: 'DIV', text: 100 } as never)
    expect(findPortalTarget(match, text)).toBe(match)
  })

  it('never takes the body', () => {
    const match = chain({ tagName: 'HTML' }, { tagName: 'BODY' })
    expect(findPortalTarget(match, text)).toBeNull()
  })
})

describe('anonymousRules', () => {
  const selectors = anonymousRules.flatMap((rule) => [
    ...(rule.hide || []),
    ...(rule.overlays || []),
    ...(rule.portals || []),
  ])
  const dom = cheerio.load('<div role="dialog"><a href="/login">x</a></div>')

  it('has something to do on every site it lists', () => {
    for (const rule of anonymousRules) {
      expect(rule.hosts.length).toBeGreaterThan(0)
      expect((rule.hide?.length || 0) + (rule.overlays?.length || 0) + (rule.portals?.length || 0)).toBeGreaterThan(0)
    }
  })

  it('lists bare lowercase hosts', () => {
    for (const host of anonymousRules.flatMap((rule) => rule.hosts)) {
      expect(host).toBe(host.toLowerCase())
      expect(host.startsWith('www.')).toBe(false)
    }
  })

  it('has selectors that parse', () => {
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      expect(() => dom(selector)).not.toThrow()
    }
  })

  it('has selectors that match the markup they were written for', () => {
    const facebook = cheerio.load('<div role="dialog"><a href="https://m.facebook.com/login/?next=x">Log in</a></div>')
    expect(facebook('div[role="dialog"]:has(a[href*="/login"])')).toHaveLength(1)

    const instagram = cheerio.load('<div role="dialog"><a href="intent://instagram.com/_u/nasa">Open</a></div>')
    expect(instagram('div[role="dialog"]:has(a[href^="intent://"])')).toHaveLength(1)

    const threads = cheerio.load('<div role="dialog" aria-modal="true"><span>Thread on Threads</span><div role="button">Download</div></div>')
    const threadsSelector = 'div[role="dialog"][aria-modal="true"]:not(:has(img, video, a, input, textarea))'
    expect(threads(threadsSelector)).toHaveLength(1)
    const viewer = cheerio.load('<div role="dialog" aria-modal="true"><img src="a.jpg"></div>')
    expect(viewer(threadsSelector)).toHaveLength(0)
  })

  it('never targets a captcha or bot check', () => {
    for (const selector of selectors) {
      expect(selector).not.toMatch(/captcha|challenge|recaptcha|turnstile|puzzle/i)
    }
  })
})
