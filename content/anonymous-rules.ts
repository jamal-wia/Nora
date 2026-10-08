import { isBlocklistExcludedHost } from '../lib/blocklist/policy'

/**
 * What the anonymous mode removes, per site. Sites change their markup often, so
 * this is plain data that is cheap to amend, and nothing in it can take a page
 * down: every selector is applied on its own, and one that stops matching or
 * stops parsing only loses itself.
 *
 * Only prompts that get in the way of reading public content belong here --
 * sign-in and sign-up walls, and "open in the app" sheets. Nothing that hides a
 * captcha or a bot check, and nothing that fetches what the site withholds.
 *
 * Each rule says when and how it was last seen working. A selector that was not
 * seen on a real page does not go in.
 */
export interface AnonymousRule {
  /** Hosts the rule applies to, with their subdomains. */
  hosts: string[]
  /**
   * Hidden outright with CSS. For prompts with a stable hook of their own; one
   * rule per selector.
   */
  hide?: string[]
  /**
   * Recognise a prompt by what is inside it. The page is searched for these, and
   * the whole fixed-position container around a match -- backdrop and close button
   * included -- is hidden, since the markup around it is usually hashed class names
   * that change. A match that is not in a fixed or sticky container is left alone.
   */
  overlays?: string[]
  /**
   * For a prompt that is not fixed itself but is mounted in a container of its own
   * directly under the body, next to its backdrop. The match is found the same way,
   * and that container is hidden -- but only if it holds little beyond the prompt,
   * so a prompt rendered inside the app can never take the whole page with it.
   */
  portals?: string[]
}

export const anonymousRules: AnonymousRule[] = [
  {
    // Seen 2026-10-08 on a logged-out public profile, mobile layout.
    hosts: ['x.com'],
    hide: [
      // "Get the full app experience" sheet and its backdrop.
      '[data-interaction="app-store-obstruction"]',
    ],
  },
  {
    // Seen 2026-10-08 on m.facebook.com, logged-out public page; the sheet also
    // locks scrolling on the body.
    hosts: ['facebook.com'],
    overlays: ['div[role="dialog"]:has(a[href*="/login"])'],
  },
  {
    // Seen 2026-10-08 on a logged-out public profile, mobile layout: "See full
    // profile in the app".
    hosts: ['instagram.com'],
    overlays: ['div[role="dialog"]:has(a[href^="intent://"])'],
  },
  {
    // Seen 2026-10-08 on a logged-out public profile, mobile layout. The sheet has
    // no link or other stable hook, so it is told apart by being a modal made of
    // nothing but text and buttons.
    hosts: ['threads.com'],
    portals: ['div[role="dialog"][aria-modal="true"]:not(:has(img, video, a, input, textarea))'],
  },
  {
    // Seen 2026-10-08 on a logged-out blog, mobile layout: the bar pinned to the
    // bottom. Found by its buttons' labels, so English only.
    hosts: ['tumblr.com'],
    overlays: ['button[aria-label="Sign up"]'],
  },
]

export function getAnonymousRules(host: string, rules: AnonymousRule[] = anonymousRules) {
  return rules.filter((rule) => isBlocklistExcludedHost(host, rule.hosts))
}
