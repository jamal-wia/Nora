import { storeSearchResults, getMorePostsPage, type MorePostsPayload } from './more-posts'
import { parseProfileSearchRequest, type SearchResult } from './public-posts'

/**
 * A search for a profile's posts runs in a tab of its own that the person does not see unless
 * DuckDuckGo asks for a check, which only they can pass. This is the part that decides what a
 * page may ask for, which tab the posts go to, and when to give up. The tabs, the timers and the
 * pages are reached through `ProfileSearchPorts`, so none of it needs a browser to be tested.
 */
export interface ProfileSearchPorts {
  /** Opens the search page without switching to it. Undefined when no tab was opened. */
  openSearchTab: (url: string, parentTabId: string) => string | undefined
  closeTab: (tabId: string) => void
  tabExists: (tabId: string) => boolean
  activeTabId: () => string | undefined
  activateTab: (tabId: string) => void
  sendToTab: (tabId: string, payload: MorePostsPayload) => void
  setInterval: (callback: () => void, ms: number) => unknown
  clearInterval: (handle: unknown) => void
  now: () => number
}

/** After this long without results the search tab is brought forward, in case it is a check. */
export const SEARCH_CHECK_AFTER_MS = 8_000
export const SEARCH_GIVE_UP_AFTER_MS = 120_000
const TICK_MS = 2_000

interface PendingSearch {
  parentTabId: string
  username: string
  startedAt: number
  timer: unknown
  shown: boolean
}

export const MAX_SEARCH_RESULTS = 60
export const MAX_MORE_POSTS_PAGE = 50

/** What a search page reports is a page's word, and is cut down to what the list is made from. */
export function sanitizeSearchResults(value: unknown): SearchResult[] {
  return (Array.isArray(value) ? value : [])
    .slice(0, MAX_SEARCH_RESULTS)
    .filter((result) => typeof result?.url === 'string' && typeof result?.snippet === 'string')
    .map((result) => ({
      url: String(result.url).slice(0, 500),
      title: String(result.title ?? '').slice(0, 300),
      snippet: String(result.snippet).slice(0, 1500),
    }))
}

/** A request for a page of the list: a profile-shaped name and a page number in range. */
export function parseLoadMoreRequest(data: unknown) {
  const { username, page } = (data || {}) as { username?: unknown; page?: unknown }
  if (typeof username !== 'string' || !/^[A-Za-z0-9._]{1,30}$/.test(username)) {
    return null
  }
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > MAX_MORE_POSTS_PAGE) {
    return null
  }
  return { username, page }
}

export const isInstagramHost = (host: string) => host === 'instagram.com' || host.endsWith('.instagram.com')
export const isSearchHost = (host: string) => host === 'html.duckduckgo.com'

export function createProfileSearch(ports: ProfileSearchPorts) {
  const pending = new Map<string, PendingSearch>()

  const finish = (searchTabId: string) => {
    const entry = pending.get(searchTabId)
    if (entry) {
      ports.clearInterval(entry.timer)
      pending.delete(searchTabId)
    }
    return entry
  }

  // Closing the search tab is the end of it, and the person is only moved if it was the one in front:
  // anyone who has gone to another tab is left where they are.
  const close = (searchTabId: string, entry: PendingSearch) => {
    const wasInFront = ports.activeTabId() === searchTabId
    if (ports.tabExists(searchTabId)) {
      ports.closeTab(searchTabId)
    }
    if (wasInFront && ports.tabExists(entry.parentTabId)) {
      ports.activateTab(entry.parentTabId)
    }
  }

  const fail = (searchTabId: string) => {
    const entry = finish(searchTabId)
    if (!entry) {
      return
    }
    close(searchTabId, entry)
    if (ports.tabExists(entry.parentTabId)) {
      ports.sendToTab(entry.parentTabId, { ...getMorePostsPage(entry.username, 0), status: 'error' })
    }
  }

  const tick = (searchTabId: string) => {
    const entry = pending.get(searchTabId)
    if (!entry) {
      return
    }
    // The person closed it, or the tab the posts were for: nothing is left to wait for.
    if (!ports.tabExists(searchTabId) || !ports.tabExists(entry.parentTabId)) {
      fail(searchTabId)
      return
    }
    const elapsed = ports.now() - entry.startedAt
    if (elapsed >= SEARCH_GIVE_UP_AFTER_MS) {
      fail(searchTabId)
    } else if (elapsed >= SEARCH_CHECK_AFTER_MS && !entry.shown) {
      entry.shown = true
      ports.activateTab(searchTabId)
    }
  }

  return {
    /**
     * A page asks for the search of a profile's posts. `allowed` is the app's side of it: the setting is
     * on, the tab is in the Anonymous profile and the page is Instagram.
     */
    start(parentTabId: string, data: unknown, allowed: boolean) {
      const request = allowed ? parseProfileSearchRequest((data as { url?: unknown } | null)?.url) : null
      if (!request) {
        return false
      }
      // One at a time for a tab: a page that asks again is not given more tabs.
      for (const entry of pending.values()) {
        if (entry.parentTabId === parentTabId) {
          return false
        }
      }
      const searchTabId = ports.openSearchTab(request.url, parentTabId)
      if (!searchTabId) {
        ports.sendToTab(parentTabId, { ...getMorePostsPage(request.username, 0), status: 'error' })
        return false
      }
      const entry: PendingSearch = {
        parentTabId,
        username: request.username,
        startedAt: ports.now(),
        timer: undefined,
        shown: false,
      }
      entry.timer = ports.setInterval(() => tick(searchTabId), TICK_MS)
      pending.set(searchTabId, entry)
      return true
    },

    /** The search tab reports what it found. Only the page of a search the app started is listened to. */
    complete(searchTabId: string, data: unknown, fromSearchPage: boolean) {
      const entry = pending.get(searchTabId)
      const { username, results } = (data || {}) as { username?: unknown; results?: unknown }
      if (!entry || !fromSearchPage || username !== entry.username) {
        return false
      }
      finish(searchTabId)
      storeSearchResults(entry.username, sanitizeSearchResults(results))
      close(searchTabId, entry)
      if (ports.tabExists(entry.parentTabId)) {
        ports.sendToTab(entry.parentTabId, getMorePostsPage(entry.username, 0))
      }
      return true
    },

    isSearchTab: (tabId: string) => pending.has(tabId),

    /** For tests and for dropping everything, such as on sign-out of a profile. */
    clear() {
      for (const searchTabId of [...pending.keys()]) {
        finish(searchTabId)
      }
    },
  }
}
