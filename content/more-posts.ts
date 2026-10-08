import { emit } from './utils'
import type { MorePostCard, MorePostsLabels, MorePostsMessage } from '../lib/more-posts'
import { noraMorePostsEvent, noraSettingsEvent } from './nora'
import { getAnonymousCss } from './anonymous'
import {
  EMBED_AUTOMATIC_RETRIES,
  EMBED_LOAD_TIMEOUT_MS,
  EMBED_RENDER_CHECK_MS,
  MIN_RENDERED_EMBED_HEIGHT,
  clampEmbedHeight,
  isEmbedLoaded,
  parseEmbedMessage,
} from './embed-messages'

const SCAN_DELAY_MS = 400
const hiddenAttribute = 'data-nora-more-posts-hidden'

// Paths on instagram.com that are a page of their own and not somebody's profile.
const reservedPaths = new Set([
  'about', 'accounts', 'api', 'challenge', 'developer', 'direct', 'directory', 'explore', 'legal', 'p', 'reel', 'reels', 'stories', 'tv', 'web',
])

/** The profile this page is, or null for any other page. */
export function getProfileUsername(hostname: string, pathname: string) {
  if (hostname !== 'instagram.com' && !hostname.endsWith('.instagram.com')) {
    return null
  }
  const match = pathname.match(/^\/([A-Za-z0-9._]{1,30})\/?$/)
  return match && !reservedPaths.has(match[1].toLowerCase()) ? match[1] : null
}

const isOn = () => Boolean(window.Nora?.getSettings?.().anonymousMorePosts)

/**
 * The gate Instagram puts over the bottom of a profile for a visitor without an
 * account: a sign-up link inside a block with a gradient. Found by that, since its
 * class names are hashed. The profile's grid is the positioned block it sits in.
 */
function findGate() {
  for (const link of document.querySelectorAll<HTMLElement>('a[href*="/accounts/signup"]')) {
    if (link.closest('[role="dialog"]')) {
      continue
    }
    let gate: HTMLElement | null = null
    let grid: HTMLElement | null = null
    for (let node = link.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (!gate && style.backgroundImage.startsWith('linear-gradient')) {
        gate = node
      }
      if (gate && !grid && style.position === 'relative' && node.getBoundingClientRect().height > 200) {
        grid = node
      }
    }
    if (gate && grid) {
      return { gate, grid }
    }
  }
  return null
}

const style = <T extends HTMLElement>(element: T, css: string) => {
  element.style.cssText = css
  return element
}

const create = <K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string) => {
  const element = style(document.createElement(tag), css)
  if (text) {
    element.textContent = text
  }
  return element
}

// Instagram's own look, on whatever theme the page is in: the text and the page behind it are
// inherited, and what is grey on one theme is a fainter shade of the same text on the other.
const INSTAGRAM_BLUE = '#0095f6'
const DIVIDER = 'rgba(127,127,127,0.3)'
const MUTED_OPACITY = '0.6'

const buttonCss =
  `display:block;margin:12px auto 0;padding:7px 16px;border:0;border-radius:8px;background:${INSTAGRAM_BLUE};` +
  'color:#fff;font:inherit;font-size:14px;font-weight:600;line-height:18px;cursor:pointer;'

const spinner = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '28')
  svg.setAttribute('height', '28')
  svg.style.cssText = 'display:block;margin:0 auto;opacity:0.6;'
  const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  for (const [name, value] of Object.entries({
    cx: '12', cy: '12', r: '9', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-dasharray': '42 100',
  })) {
    arc.setAttribute(name, value)
  }
  const turn = document.createElementNS('http://www.w3.org/2000/svg', 'animateTransform')
  for (const [name, value] of Object.entries({
    attributeName: 'transform', type: 'rotate', from: '0 12 12', to: '360 12 12', dur: '0.9s', repeatCount: 'indefinite',
  })) {
    turn.setAttribute(name, value)
  }
  arc.appendChild(turn)
  svg.appendChild(arc)
  return svg
}

const ICON_PATHS = {
  heart:
    'M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938Z',
  comment: 'M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z',
}

/** A count with its outline icon, the way Instagram shows likes and comments. */
const countWithIcon = (icon: keyof typeof ICON_PATHS, count: string) => {
  const item = create('span', 'display:inline-flex;align-items:center;gap:6px;margin-right:16px;font-weight:600;')
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '18')
  svg.setAttribute('height', '18')
  svg.style.cssText = 'display:block;'
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  for (const [name, value] of Object.entries({
    d: ICON_PATHS[icon], fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  })) {
    path.setAttribute(name, value)
  }
  svg.appendChild(path)
  item.appendChild(svg)
  item.appendChild(document.createTextNode(count))
  return item
}

/**
 * What tells the two lists apart: the posts above are the profile's own, the ones below are what
 * a search found. A thin line each side of a small label, the way Instagram marks a change of
 * section, so it reads as part of the page and not as something added to it.
 */
const createDivider = (label: string) => {
  const divider = create('div', 'display:flex;align-items:center;gap:12px;padding:20px 16px 12px;')
  divider.setAttribute('data-more-divider', '1')
  const line = () => create('div', `flex:1;height:1px;background:${DIVIDER};`)
  divider.appendChild(line())
  divider.appendChild(
    create('div', `font-size:12px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;opacity:${MUTED_OPACITY};`, label),
  )
  divider.appendChild(line())
  return divider
}

const formatDate = (date: number) =>
  new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

interface EmbedCard {
  frame: HTMLIFrameElement
  wrapper: HTMLElement
  url: string
  labels: MorePostsLabels
  attempts: number
  loaded: boolean
  timer: ReturnType<typeof setTimeout> | undefined
}

/** Shows the block below a profile and fills it with what the app finds. */
export function initMorePosts() {
  const embeds = new Set<EmbedCard>()
  const pendingEmbeds = new WeakMap<HTMLIFrameElement, EmbedCard>()

  /**
   * Starts a post loading and waits for it to say it is on screen. Instagram sometimes does not
   * show a post it showed a moment before, and a page that does not load never says so, so it is
   * tried once more and then replaced by a note that can be tried again by hand.
   */
  const startEmbed = (embed: EmbedCard) => {
    // Gone with the list it was in: nothing is started, or waited for, for a card that is not there.
    if (!embeds.has(embed)) {
      return
    }
    embed.loaded = false
    clearTimeout(embed.timer)
    showEmbedSpinner(embed)
    embed.frame.src = embed.url
    embed.timer = setTimeout(() => {
      if (!embed.loaded) {
        failEmbed(embed)
      }
    }, EMBED_LOAD_TIMEOUT_MS)
  }

  const failEmbed = (embed: EmbedCard) => {
    if (embed.attempts < EMBED_AUTOMATIC_RETRIES) {
      embed.attempts += 1
      embed.frame.removeAttribute('src')
      embed.timer = setTimeout(() => startEmbed(embed), 300)
    } else {
      showEmbedUnavailable(embed)
    }
  }

  /** The slot a post will fill says so while it waits, instead of standing empty. */
  const showEmbedSpinner = (embed: EmbedCard) => {
    if (embed.wrapper.querySelector('[data-embed-spinner]')) {
      return
    }
    const holder = create('div', 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;')
    holder.setAttribute('data-embed-spinner', '1')
    holder.appendChild(spinner())
    embed.frame.parentElement?.appendChild(holder)
  }

  const hideEmbedSpinner = (embed: EmbedCard) => embed.wrapper.querySelector('[data-embed-spinner]')?.remove()

  /** A page can say it is on screen and still be blank; a frame that shows nothing is tried again like one that never answered. */
  const checkEmbedRendered = (embed: EmbedCard) => {
    if (!embeds.has(embed) || !embed.loaded) {
      return
    }
    try {
      const rendered = embed.frame.contentDocument?.querySelector('.Embed')
      if (rendered && rendered.getBoundingClientRect().height > MIN_RENDERED_EMBED_HEIGHT) {
        return
      }
    } catch {
      return
    }
    embed.loaded = false
    failEmbed(embed)
  }

  const showEmbedUnavailable = (embed: EmbedCard) => {
    hideEmbedSpinner(embed)
    embed.frame.removeAttribute('src')
    embed.frame.style.display = 'none'
    // The link leads to the same page, which would not show the post either.
    embed.wrapper.querySelector<HTMLElement>('[data-open-post]')?.style.setProperty('display', 'none')
    embed.wrapper.querySelector('[data-embed-unavailable]')?.remove()
    const note = create('div', `padding:20px 16px 4px;text-align:center;font-size:14px;line-height:18px;opacity:${MUTED_OPACITY};`, embed.labels.unavailable)
    note.setAttribute('data-embed-unavailable', '1')
    const retry = create('button', `${buttonCss}margin:12px auto 0;`, embed.labels.retry)
    retry.type = 'button'
    retry.addEventListener('click', () => {
      note.remove()
      embed.wrapper.querySelector<HTMLElement>('[data-open-post]')?.style.removeProperty('display')
      embed.attempts = 0
      embed.frame.style.display = 'block'
      startEmbed(embed)
    })
    note.appendChild(retry)
    embed.frame.insertAdjacentElement('afterend', note)
  }

  window.addEventListener('message', (event) => {
    const message = parseEmbedMessage(event.data)
    if (!message) {
      return
    }
    for (const embed of embeds) {
      if (embed.frame.contentWindow !== event.source) {
        continue
      }
      if (message.type === 'MEASURE' && message.height) {
        embed.frame.style.height = `${clampEmbedHeight(message.height)}px`
      }
      if (isEmbedLoaded(message)) {
        embed.loaded = true
        clearTimeout(embed.timer)
        hideEmbedSpinner(embed)
        setTimeout(() => checkEmbedRendered(embed), EMBED_RENDER_CHECK_MS)
      }
      return
    }
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  let current: { username: string; block: HTMLElement; gate: HTMLElement; page: number; loading: boolean } | null = null
  let observer: IntersectionObserver | undefined

  const remove = () => {
    if (!current) {
      return
    }
    current.block.remove()
    current.gate.style.removeProperty('display')
    current.gate.removeAttribute(hiddenAttribute)
    current = null
    for (const embed of embeds) {
      clearTimeout(embed.timer)
    }
    embeds.clear()
    observer?.disconnect()
    observer = undefined
  }

  const request = (page: number) => {
    if (!current) {
      return
    }
    current.loading = true
    current.page = page
    emit('load-more-posts', { username: current.username, page })
  }

  const renderStatus = (block: HTMLElement, text: string | null) => {
    block.querySelector('[data-more-status]')?.remove()
    const status = create('div', 'padding:20px 16px;text-align:center;font-size:14px;line-height:18px;')
    status.setAttribute('data-more-status', '1')
    // Announced as it changes: a search, an error and an empty list are all said aloud.
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    if (text === null) {
      status.appendChild(spinner())
    } else {
      status.appendChild(create('div', `opacity:${MUTED_OPACITY};`, text))
    }
    block.appendChild(status)
  }

  /**
   * What the list starts as: one button that says what it does -- carry on with this profile's
   * posts, found through a search -- and a line on who sees the name. Nothing is looked up until
   * it is pressed.
   */
  const renderContinue = (block: HTMLElement, payload: MorePostsMessage, message?: string) => {
    block.querySelector('[data-more-status]')?.remove()
    const status = create('div', 'padding:16px 16px 20px;text-align:center;font-size:14px;line-height:18px;')
    status.setAttribute('data-more-status', '1')
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    if (message) {
      status.appendChild(create('div', `margin-bottom:12px;opacity:${MUTED_OPACITY};`, message))
    }
    const button = create('button', `${buttonCss}margin:0 auto;`, payload.labels.continue)
    button.type = 'button'
    button.addEventListener('click', () => {
      if (!payload.searchUrl) {
        return
      }
      renderStatus(block, null)
      block.querySelector('[data-more-status]')?.appendChild(create('div', `margin-top:10px;font-size:12px;opacity:${MUTED_OPACITY};`, payload.labels.searching))
      emit('search-profile-posts', { url: payload.searchUrl })
    })
    status.appendChild(button)
    status.appendChild(create('div', `margin-top:10px;font-size:12px;line-height:16px;opacity:${MUTED_OPACITY};`, payload.labels.continueHint))
    block.insertBefore(status, block.querySelector('[data-more-note]'))
  }

  const renderCard = (card: MorePostCard, labels: MorePostsLabels) => {
    const wrapper = create('div', `padding:12px 0;border-bottom:1px solid ${DIVIDER};`)
    wrapper.setAttribute('data-more-card', '1')

    // Counts on the left, the date on the right, the way a post's header reads.
    const header = create('div', 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:0 16px;font-size:14px;line-height:18px;')
    const counts = create('div', 'display:flex;align-items:center;')
    if (card.likes) {
      counts.appendChild(countWithIcon('heart', card.likes))
    }
    if (card.comments) {
      counts.appendChild(countWithIcon('comment', card.comments))
    }
    header.appendChild(counts)
    if (card.date !== null) {
      header.appendChild(create('span', `font-size:12px;opacity:${MUTED_OPACITY};`, formatDate(card.date)))
    }
    if (card.likes || card.comments || card.date !== null) {
      wrapper.appendChild(header)
    }

    if (card.caption) {
      wrapper.appendChild(
        create(
          'div',
          'padding:6px 16px 0;font-size:14px;line-height:18px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;',
          card.caption,
        ),
      )
    }

    // The picture comes from Instagram's own embed page, loaded only once the card is near the screen.
    const slot = create('div', 'position:relative;max-width:540px;margin:10px auto 0;')
    const frame = create('iframe', 'display:block;width:100%;height:560px;border:0;')
    // No sandbox: the page is on instagram.com like this one, and a sandbox that lets its scripts keep their
    // origin leaves nothing to separate them. The posts the embed page may show are Instagram's to show.
    frame.title = card.caption.slice(0, 80) || labels.openPost
    frame.setAttribute('loading', 'lazy')
    slot.appendChild(frame)
    wrapper.appendChild(slot)
    // The embed page is on instagram.com like this one, so what the mode hides on an embed page can be hidden
    // inside the card too, once it has loaded.
    frame.addEventListener('load', () => {
      try {
        const doc = frame.contentDocument
        if (doc?.head && !doc.getElementById('_nora_embed_css')) {
          const style = doc.createElement('style')
          style.id = '_nora_embed_css'
          style.textContent = getAnonymousCss('www.instagram.com', true)
          doc.head.appendChild(style)
        }
      } catch {
        // A frame that is not on this origin cannot be reached, and is left as it is.
      }
    })
    const embed: EmbedCard = { frame, wrapper, url: card.embedUrl, labels, attempts: 0, loaded: false, timer: undefined }
    embeds.add(embed)
    pendingEmbeds.set(frame, embed)
    observer?.observe(frame)

    const open = create('a', `display:block;padding:10px 16px 0;font-size:14px;font-weight:600;line-height:18px;color:${INSTAGRAM_BLUE};text-decoration:none;`, labels.openPost)
    // The embed page, in this tab: it has the player, and going back lands on the profile.
    open.href = card.embedUrl
    open.setAttribute('data-open-post', '1')
    wrapper.appendChild(open)
    return wrapper
  }

  const onPayload = (event: Event) => {
    const payload = (event as CustomEvent<MorePostsMessage>).detail
    if (!current || payload?.username !== current.username) {
      return
    }
    current.loading = false
    const { block } = current
    block.querySelector('[data-more-status]')?.remove()
    block.querySelector('[data-more-button]')?.remove()
    if (payload.status === 'idle' || payload.status === 'error') {
      renderContinue(block, payload, payload.status === 'error' ? payload.labels.error : undefined)
      return
    }

    // A first page is a new list: what was shown before, when a search has been done again after the
    // last one went stale, is replaced and not added to.
    if (payload.page === 0) {
      for (const stale of block.querySelectorAll('[data-more-card], [data-more-divider]')) {
        stale.remove()
      }
      for (const embed of [...embeds]) {
        if (!embed.wrapper.isConnected) {
          clearTimeout(embed.timer)
          embeds.delete(embed)
        }
      }
    }
    // The note is the foot of the list, so it is taken off while the list grows and put back after.
    block.querySelector('[data-more-note]')?.remove()
    if (!block.querySelector('[data-more-divider]')) {
      block.insertBefore(createDivider(payload.labels.title), block.firstChild)
    }
    for (const card of payload.posts) {
      block.appendChild(renderCard(card, payload.labels))
    }
    if (payload.hasMore) {
      const more = create('button', `${buttonCss}margin:16px auto;`, payload.labels.more)
      more.type = 'button'
      more.setAttribute('data-more-button', '1')
      more.addEventListener('click', () => {
        if (current && !current.loading) {
          more.disabled = true
          more.style.opacity = '0.7'
          request(current.page + 1)
        }
      })
      block.appendChild(more)
    } else if (payload.page === 0 && !payload.posts.length) {
      renderStatus(block, payload.labels.empty)
    }
    const note = create('div', `padding:8px 16px 20px;text-align:center;font-size:12px;line-height:16px;opacity:${MUTED_OPACITY};`, payload.labels.note)
    note.setAttribute('data-more-note', '1')
    block.appendChild(note)
  }

  const scan = () => {
    timer = undefined
    const username = isOn() ? getProfileUsername(document.location.hostname, document.location.pathname) : null
    if (!username || (current && current.username !== username)) {
      remove()
    }
    if (!username || current) {
      // The block is gone when the page replaced the part it sat in.
      if (current && !current.block.isConnected) {
        remove()
      }
      return
    }

    const found = findGate()
    if (!found) {
      return
    }
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const frame = entry.target as HTMLIFrameElement
          const embed = pendingEmbeds.get(frame)
          if (entry.isIntersecting && embed) {
            pendingEmbeds.delete(frame)
            observer?.unobserve(frame)
            startEmbed(embed)
          }
        }
      },
      { rootMargin: '400px' },
    )
    // Straight under the grid, so the list carries on from it.
    const block = create('div', 'margin:0;padding:0;')
    found.gate.setAttribute(hiddenAttribute, '1')
    found.gate.style.setProperty('display', 'none', 'important')
    found.grid.insertAdjacentElement('afterend', block)
    current = { username, block, gate: found.gate, page: 0, loading: false }
    renderStatus(block, null)
    request(0)
  }

  const schedule = () => {
    if (timer === undefined) {
      timer = setTimeout(scan, SCAN_DELAY_MS)
    }
  }

  window.addEventListener(noraMorePostsEvent, onPayload)
  window.addEventListener(noraSettingsEvent, schedule)
  schedule()
  return schedule
}
