import { anonymousRules, getAnonymousRules, type AnonymousRule } from './anonymous-rules'
import { noraSettingsEvent } from './nora'

const hiddenAttribute = 'data-nora-anonymous-hidden'
const promptAttribute = 'data-nora-anonymous-prompt'
const unpaddedAttribute = 'data-nora-anonymous-unpadded'
const SCAN_DELAY_MS = 250

/**
 * The style half of the mode. Every selector gets a rule of its own: a selector
 * list is thrown away whole when one entry in it does not parse. Empty for a site
 * with no rules, so nothing is injected on pages the mode has nothing to say about.
 */
export function getAnonymousCss(host: string, enabled: boolean, rules: AnonymousRule[] = anonymousRules) {
  if (!enabled) {
    return ''
  }
  const matched = getAnonymousRules(host, rules)
  if (!matched.length) {
    return ''
  }

  const hidden = matched.flatMap((rule) => rule.hide || []).map((selector) => `${selector} { display: none !important; }`)
  return [
    ...hidden,
    `[${hiddenAttribute}] { display: none !important; }`,
    // The room a hidden bar had been given at the top.
    `[${unpaddedAttribute}] { padding-top: 0 !important; }`,
    // A sheet that locked the page's scrolling leaves it locked once it is hidden.
    // Only while one has been hidden, so a lock the site sets for its own reasons
    // is not undone on pages that never showed a prompt.
    // The page scrolls, not the body: `overflow: auto` on the body would make it a scroll
    // container of its own wherever its height is fixed, and the page would stop moving.
    `html[${promptAttribute}] { overflow: auto !important; }`,
    `html[${promptAttribute}] body { overflow: visible !important; }`,
  ].join('\n')
}

/**
 * The container to hide for a prompt that was recognised by its contents: the
 * outermost fixed or sticky ancestor, or the element itself. Null when the match
 * does not sit in anything floating, which means it is part of the page and not a
 * prompt over it.
 */
export function findOverlayTarget<T extends { parentElement: T | null; tagName: string }>(
  match: T,
  isFloating: (element: T) => boolean,
) {
  let target: T | null = null
  for (let node: T | null = match; node && node.tagName !== 'BODY' && node.tagName !== 'HTML'; node = node.parentElement) {
    if (isFloating(node)) {
      target = node
    }
  }
  return target
}

const PORTAL_TEXT_MARGIN = 200

/**
 * The container directly under the body that a prompt is mounted in, for prompts
 * that are not fixed themselves. Null when that container holds more than the
 * prompt and a little text around it: then it is the app, and hiding it would
 * hide the page.
 */
export function findPortalTarget<T extends { parentElement: T | null; tagName: string }>(
  match: T,
  textLength: (element: T) => number,
) {
  let top: T = match
  while (top.parentElement && top.parentElement.tagName !== 'BODY') {
    top = top.parentElement
  }
  if (!top.parentElement || top.tagName === 'BODY') {
    return null
  }
  return textLength(top) <= textLength(match) + PORTAL_TEXT_MARGIN ? top : null
}

/**
 * A bar pinned to the top leaves a gap under it, because the page makes room for it with padding
 * on a container of its own. Once the bar is hidden that padding is the gap, so the ancestor of
 * what is now at the top whose padding is closest to the bar's height is the one to give it back.
 * Null when no container is padded by about that much.
 */
export function findPaddedAncestor<T extends { parentElement: T | null; tagName: string }>(
  start: T | null,
  barHeight: number,
  paddingTopOf: (element: T) => number,
  // A page rounds the room it makes to its own scale and the bar can carry a border, so the two differ by a little.
  tolerance = 8,
) {
  if (barHeight <= 0) {
    return null
  }
  let best: T | null = null
  let bestDistance = Infinity
  for (let node = start; node && node.tagName !== 'BODY' && node.tagName !== 'HTML'; node = node.parentElement) {
    const padding = paddingTopOf(node)
    const distance = Math.abs(padding - barHeight)
    // Ties go to the outer one, which is where a page puts the room for a bar.
    if (padding > 0 && distance <= tolerance && distance <= bestDistance) {
      best = node
      bestDistance = distance
    }
  }
  return best
}

/** The most text a prompt's container may hold: more than that is the page, and is not hidden. */
export const OVERLAY_MAX_TEXT = 800

const isFloating = (element: Element) => {
  const { position } = getComputedStyle(element)
  return position === 'fixed' || position === 'sticky'
}

const isModeOn = () => Boolean(window.Nora?.getSettings?.().anonymousMode)

/** What was hidden for a match, so that it can be given back when the match goes. */
interface Handled {
  selector: string
  target: Element
  locksScroll: boolean
  unpadded?: Element
  barHeight: number
}

/**
 * The script half of the mode, for prompts that can only be found by what is in
 * them. It scans a little after the page changes rather than on every change,
 * and a failing selector is skipped without stopping the others.
 */
export function initAnonymousMode() {
  const { hostname } = document.location
  if (!getAnonymousRules(hostname).some((rule) => rule.overlays?.length || rule.portals?.length || rule.dismiss?.length)) {
    return () => {}
  }

  const handled = new Map<Element, Handled>()
  // Matches that were looked at and are not prompts, so that they are not looked at again.
  const rejected = new WeakSet<Element>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const release = (entry: Handled) => {
    entry.target.removeAttribute(hiddenAttribute)
    entry.unpadded?.removeAttribute(unpaddedAttribute)
  }

  const releaseAll = () => {
    for (const entry of handled.values()) {
      release(entry)
    }
    handled.clear()
    document.documentElement.removeAttribute(promptAttribute)
  }

  const stillMatches = (match: Element, selector: string) => {
    try {
      return match.isConnected && match.matches(selector)
    } catch {
      return false
    }
  }

  // The room a page made for a bar at the top is looked for again while the bar is hidden, since a
  // page that redraws its container brings the padding back.
  const giveBackRoom = (entry: Handled) => {
    if (entry.barHeight <= 0 || (entry.unpadded?.isConnected && entry.unpadded.hasAttribute(unpaddedAttribute))) {
      return
    }
    const padded = findPaddedAncestor(
      document.elementFromPoint(window.innerWidth / 2, entry.barHeight + 4),
      entry.barHeight,
      (element) => parseFloat(getComputedStyle(element).paddingTop) || 0,
    )
    padded?.setAttribute(unpaddedAttribute, '1')
    entry.unpadded = padded ?? undefined
  }

  const scan = () => {
    timer = undefined
    if (!isModeOn()) {
      releaseAll()
      return
    }

    // What was hidden for a prompt that has gone is given back, whatever else shares its container.
    for (const [match, entry] of handled) {
      if (!stillMatches(match, entry.selector)) {
        release(entry)
        handled.delete(match)
      }
    }

    const hide = (
      rule: { selectors: string[]; locksScroll: boolean },
      findTarget: (match: Element) => Element | null,
    ) => {
      for (const selector of rule.selectors) {
        try {
          for (const match of document.querySelectorAll(selector)) {
            if (handled.has(match) || rejected.has(match)) {
              continue
            }
            const target = findTarget(match)
            if (!target) {
              rejected.add(match)
              continue
            }
            const { height, top } = target.getBoundingClientRect()
            target.setAttribute(hiddenAttribute, '1')
            handled.set(match, { selector, target, locksScroll: rule.locksScroll, barHeight: top <= 1 ? height : 0 })
          }
        } catch {
          // A selector this engine does not understand, or a page in a state it cannot be
          // queried in. The rest of the rules still run.
        }
      }
    }

    for (const rule of getAnonymousRules(hostname)) {
      const locksScroll = Boolean(rule.locksScroll)
      hide({ selectors: rule.overlays || [], locksScroll }, (match) => {
        const target = findOverlayTarget(match, isFloating)
        return target && (target.textContent?.length ?? 0) <= OVERLAY_MAX_TEXT ? target : null
      })
      // Clicked, not hidden: the page's own code is what must stop blocking the scroll.
      hide({ selectors: rule.dismiss || [], locksScroll }, (match) => {
        ;(match as HTMLElement).click()
        return match
      })
      hide({ selectors: rule.portals || [], locksScroll }, (match) =>
        findPortalTarget(match, (element) => element.textContent?.length ?? 0),
      )
    }

    for (const entry of handled.values()) {
      giveBackRoom(entry)
    }
    const root = document.documentElement
    if ([...handled.values()].some((entry) => entry.locksScroll)) {
      root.setAttribute(promptAttribute, '1')
    } else {
      root.removeAttribute(promptAttribute)
    }
  }

  const schedule = () => {
    // Pages of other profiles change all the time and have nothing to do here.
    if (timer === undefined && (isModeOn() || handled.size)) {
      timer = setTimeout(scan, SCAN_DELAY_MS)
    }
  }

  // A change of the setting is always looked at: it is what turns the mode on or off.
  window.addEventListener(noraSettingsEvent, () => {
    if (timer === undefined) {
      timer = setTimeout(scan, SCAN_DELAY_MS)
    }
  })
  schedule()
  return schedule
}
