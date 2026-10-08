import { emit } from './utils'
import { noraMorePostsEvent, noraSettingsEvent } from './nora'

const SCAN_DELAY_MS = 400
const blockId = '_nora_more_posts'
const hiddenAttribute = 'data-nora-more-posts-hidden'

// Paths on instagram.com that are a page of their own and not somebody's profile.
const reservedPaths = new Set([
  'about', 'accounts', 'api', 'challenge', 'developer', 'direct', 'directory', 'explore', 'legal', 'p', 'reel', 'reels', 'stories', 'tv', 'web',
])

export interface MorePostsLabels {
  title: string
  loading: string
  more: string
  openSearch: string
  openPost: string
  note: string
  challenge: string
  error: string
  empty: string
}

interface MorePostCard {
  url: string
  embedUrl: string
  date: number | null
  likes: string | null
  comments: string | null
  caption: string
}

interface MorePostsPayload {
  username: string
  page: number
  status: 'ok' | 'challenge' | 'error'
  posts: MorePostCard[]
  hasMore: boolean
  searchUrl: string | null
  labels: MorePostsLabels
}

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

const formatDate = (date: number) =>
  new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

/** Shows the block below a profile and fills it with what the app finds. */
export function initMorePosts() {
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

  const renderStatus = (block: HTMLElement, text: string | null, searchUrl?: string | null, labels?: MorePostsLabels) => {
    block.querySelector('[data-more-status]')?.remove()
    const status = create('div', 'padding:20px 16px;text-align:center;font-size:14px;line-height:18px;')
    status.setAttribute('data-more-status', '1')
    if (text === null) {
      status.appendChild(spinner())
    } else {
      status.appendChild(create('div', `opacity:${MUTED_OPACITY};`, text))
    }
    if (searchUrl && labels) {
      const button = create('button', buttonCss, labels.openSearch)
      button.type = 'button'
      button.addEventListener('click', () => emit('open-anonymous-tab', { url: searchUrl }))
      status.appendChild(button)
    }
    block.appendChild(status)
  }

  const renderCard = (card: MorePostCard, labels: MorePostsLabels) => {
    const wrapper = create('div', `padding:12px 0;border-bottom:1px solid ${DIVIDER};`)

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
    const frame = create('iframe', 'display:block;width:100%;max-width:540px;height:560px;border:0;margin:10px auto 0;')
    frame.setAttribute('data-src', card.embedUrl)
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups')
    frame.setAttribute('loading', 'lazy')
    wrapper.appendChild(frame)
    observer?.observe(frame)

    const open = create('a', `display:block;padding:10px 16px 0;font-size:14px;font-weight:600;line-height:18px;color:${INSTAGRAM_BLUE};text-decoration:none;`, labels.openPost)
    // The embed page, in this tab: it has the player, and going back lands on the profile.
    open.href = card.embedUrl
    wrapper.appendChild(open)
    return wrapper
  }

  const onPayload = (event: Event) => {
    const payload = (event as CustomEvent<MorePostsPayload>).detail
    if (!current || payload?.username !== current.username) {
      return
    }
    current.loading = false
    const { block } = current
    block.querySelector('[data-more-status]')?.remove()
    block.querySelector('[data-more-button]')?.remove()
    if (!block.querySelector('[data-more-title]')) {
      const title = create(
        'div',
        `padding:16px 16px 8px;text-align:center;font-size:12px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;opacity:${MUTED_OPACITY};`,
        payload.labels.title,
      )
      title.setAttribute('data-more-title', '1')
      block.insertBefore(title, block.firstChild)
    }

    if (payload.status === 'challenge') {
      renderStatus(block, payload.labels.challenge, payload.searchUrl, payload.labels)
      return
    }
    if (payload.status === 'error') {
      renderStatus(block, payload.labels.error, payload.searchUrl, payload.labels)
      return
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
    if (!block.querySelector('[data-more-note]')) {
      const note = create('div', `padding:8px 16px 20px;text-align:center;font-size:12px;line-height:16px;opacity:${MUTED_OPACITY};`, payload.labels.note)
      note.setAttribute('data-more-note', '1')
      block.appendChild(note)
    }
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
          if (entry.isIntersecting && frame.dataset.src) {
            frame.src = frame.dataset.src
            frame.removeAttribute('data-src')
            observer?.unobserve(frame)
          }
        }
      },
      { rootMargin: '400px' },
    )
    const block = create('div', `margin-top:4px;border-top:1px solid ${DIVIDER};`)
    block.id = blockId
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
