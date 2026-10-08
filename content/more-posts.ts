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

const formatDate = (date: number) =>
  new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })

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

  const renderStatus = (block: HTMLElement, text: string, searchUrl?: string | null, labels?: MorePostsLabels) => {
    block.querySelector('[data-more-status]')?.remove()
    const status = create('div', 'padding:12px 4px;font-size:14px;opacity:0.8;', text)
    status.setAttribute('data-more-status', '1')
    if (searchUrl && labels) {
      const button = create('button', 'display:block;margin:10px 0 0;padding:8px 14px;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;', labels.openSearch)
      button.type = 'button'
      button.addEventListener('click', () => emit('new-tab', { url: searchUrl, kind: 'link' }))
      status.appendChild(button)
    }
    block.appendChild(status)
  }

  const renderCard = (card: MorePostCard, labels: MorePostsLabels) => {
    const wrapper = create('div', 'margin:12px 0;border:1px solid rgba(127,127,127,0.35);border-radius:12px;overflow:hidden;')
    const meta = [card.date !== null ? formatDate(card.date) : '', card.likes ? `♥ ${card.likes}` : '', card.comments ? `💬 ${card.comments}` : '']
      .filter(Boolean)
      .join('  ·  ')
    if (meta) {
      wrapper.appendChild(create('div', 'padding:10px 12px 0;font-size:13px;opacity:0.75;', meta))
    }
    if (card.caption) {
      wrapper.appendChild(create('div', 'padding:6px 12px 0;font-size:14px;line-height:1.4;', card.caption))
    }
    // The picture comes from Instagram's own embed page, loaded only once the card is near the screen.
    const frame = create('iframe', 'display:block;width:100%;height:560px;border:0;margin-top:8px;')
    frame.setAttribute('data-src', card.embedUrl)
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups')
    frame.setAttribute('loading', 'lazy')
    wrapper.appendChild(frame)
    observer?.observe(frame)
    const open = create('a', 'display:block;padding:10px 12px;font-size:14px;', labels.openPost)
    open.href = card.url
    open.addEventListener('click', (event) => {
      event.preventDefault()
      emit('new-tab', { url: card.url, kind: 'link' })
    })
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
      const more = create('button', 'display:block;width:100%;margin:8px 0;padding:12px;border-radius:12px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;', payload.labels.more)
      more.type = 'button'
      more.setAttribute('data-more-button', '1')
      more.addEventListener('click', () => {
        if (current && !current.loading) {
          more.disabled = true
          request(current.page + 1)
        }
      })
      block.appendChild(more)
    } else if (payload.page === 0 && !payload.posts.length) {
      renderStatus(block, payload.labels.empty)
    }
    if (!block.querySelector('[data-more-note]')) {
      const note = create('div', 'padding:4px 4px 16px;font-size:12px;opacity:0.65;', payload.labels.note)
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
    const block = create('div', 'padding:8px 12px;', '')
    block.id = blockId
    found.gate.setAttribute(hiddenAttribute, '1')
    found.gate.style.setProperty('display', 'none', 'important')
    found.grid.insertAdjacentElement('afterend', block)
    current = { username, block, gate: found.gate, page: 0, loading: false }
    renderStatus(block, '…')
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
