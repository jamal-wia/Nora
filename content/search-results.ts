import { noraSettingsEvent } from './nora'
import { getSearchPageUsername, isChallengePage, parseSearchResults, type SearchResult } from '../lib/public-posts'

const STORAGE_KEY = '__nora_posts_search'
const MAX_PAGES = 3

interface SearchState {
  username: string
  page: number
  results: SearchResult[]
}

const readState = (): SearchState | null => {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

const writeState = (state: SearchState | null) => {
  try {
    if (state) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // No storage on this page: the search then ends at the first page of results.
  }
}

/**
 * The page DuckDuckGo shows for the search of a profile's posts, opened by the app in a tab so a
 * person can pass its check themselves. Once it shows results, they are read -- a few pages of
 * them, by following its own Next button -- and handed to the app, which closes the tab and adds
 * the posts to the profile the search was opened from. A check is left to the person: nothing
 * happens until the page has results.
 */
export function initSearchResultsReporter(emit: (type: string, data: unknown) => void) {
  if (document.location.hostname !== 'html.duckduckgo.com') {
    return
  }

  let handled = false
  const run = () => {
    // The app's word that the mode is on reaches a page that has only just opened after the page
    // has loaded, so this is tried again when it arrives, and acts once.
    if (handled || !window.Nora?.getSettings?.().anonymousMode || document.readyState === 'loading') {
      return
    }
    const html = document.documentElement.outerHTML
    if (isChallengePage(html)) {
      return
    }
    handled = true

    // The address of a search for a profile starts one; the pages after it have none to read.
    const started = getSearchPageUsername(document.location.href)
    const state: SearchState | null = started ? { username: started, page: 0, results: [] } : readState()
    if (!state) {
      return
    }

    state.results.push(...parseSearchResults(html))
    state.page += 1
    const next = document.querySelector<HTMLFormElement>('.nav-link form')
    if (state.page < MAX_PAGES && next) {
      writeState(state)
      next.submit()
      return
    }

    writeState(null)
    emit('search-results', { username: state.username, results: state.results })
  }

  window.addEventListener(noraSettingsEvent, run)
  document.addEventListener('DOMContentLoaded', run, { once: true })
  run()
}
