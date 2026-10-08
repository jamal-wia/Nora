import { anonymousRules, getAnonymousRules, type AnonymousRule } from './anonymous-rules'
import { noraSettingsEvent } from './nora'

const hiddenAttribute = 'data-nora-anonymous-hidden'
const promptAttribute = 'data-nora-anonymous-prompt'
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

const isFloating = (element: Element) => {
  const { position } = getComputedStyle(element)
  return position === 'fixed' || position === 'sticky'
}

const isModeOn = () => Boolean(window.Nora?.getSettings?.().anonymousMode)

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

  const handled = new Set<Element>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const scan = () => {
    timer = undefined
    const root = document.documentElement
    if (!isModeOn()) {
      handled.clear()
      root.removeAttribute(promptAttribute)
      return
    }

    const hide = (selectors: string[], findTarget: (match: Element) => Element | null) => {
      for (const selector of selectors) {
        try {
          for (const match of document.querySelectorAll(selector)) {
            if (handled.has(match)) {
              continue
            }
            const target = findTarget(match)
            if (target) {
              target.setAttribute(hiddenAttribute, '1')
              handled.add(match)
            }
          }
        } catch {
          // A selector this engine does not understand, or a page in a state it cannot be
          // queried in. The rest of the rules still run.
        }
      }
    }
    const rules = getAnonymousRules(hostname)
    hide(
      rules.flatMap((rule) => rule.overlays || []),
      (match) => findOverlayTarget(match, isFloating),
    )
    // Clicked, not hidden: the page's own code is what must stop blocking the scroll.
    hide(
      rules.flatMap((rule) => rule.dismiss || []),
      (match) => {
        ;(match as HTMLElement).click()
        return match
      },
    )
    hide(
      rules.flatMap((rule) => rule.portals || []),
      (match) => findPortalTarget(match, (element) => element.textContent?.length ?? 0),
    )

    for (const match of handled) {
      if (!match.isConnected) {
        handled.delete(match)
      }
    }
    if (handled.size) {
      root.setAttribute(promptAttribute, '1')
    } else {
      root.removeAttribute(promptAttribute)
    }
  }

  const schedule = () => {
    if (timer === undefined) {
      timer = setTimeout(scan, SCAN_DELAY_MS)
    }
  }

  window.addEventListener(noraSettingsEvent, schedule)
  schedule()
  return schedule
}
