import { emit } from './utils'
import { getProfileUsername } from './more-posts'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
// A media id is a 19 digit number. Some image addresses carry the id of the account
// after it, with nothing in between.
const MEDIA_ID_LENGTH = 19

/**
 * The id of the post a picture belongs to, read from its address: Instagram marks
 * every picture with the id of its post, base64 encoded, as `ig_cache_key`. Null for
 * a picture that is not a post's, such as a profile photo.
 */
export function getMediaId(src: string) {
  try {
    const key = new URL(src).searchParams.get('ig_cache_key')
    if (!key) {
      return null
    }
    let encoded = key.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')
    while (encoded.length % 4) {
      encoded += '='
    }
    const digits = atob(encoded).match(/^\d+/)?.[0]
    return digits ? digits.slice(0, MEDIA_ID_LENGTH) : null
  } catch {
    return null
  }
}

/** The short code in a post's address, which is its id written with 64 characters. */
export function toShortcode(mediaId: string) {
  if (!/^\d{1,19}$/.test(mediaId)) {
    return null
  }
  let rest = BigInt(mediaId)
  let code = ''
  while (rest > 0n) {
    code = ALPHABET[Number(rest % 64n)] + code
    rest /= 64n
  }
  return code || null
}

/** The address of the post that a picture on a profile belongs to, or null. */
export function getPostUrl(src: string) {
  const id = getMediaId(src)
  const code = id && toShortcode(id)
  return code ? `https://www.instagram.com/p/${code}/` : null
}

const POST_PAGE = /^\/(?:[A-Za-z0-9._]{1,30}\/)?(p|reel|tv)\/([A-Za-z0-9_-]{5,})\/?$/

/**
 * Where a post's own page should be shown instead: its embed page. The page Instagram
 * gives a visitor without an account asks for the app in place of the post, or has no
 * player; the embed page has the player and needs nothing. Null for any other page, and
 * for the embed page itself.
 */
export function getEmbedUrlForPage(hostname: string, pathname: string) {
  if (!/(^|\.)instagram\.com$/.test(hostname)) {
    return null
  }
  const match = pathname.match(POST_PAGE)
  return match ? `https://www.instagram.com/${match[1]}/${match[2]}/embed/` : null
}

/** The link an embed page puts over a video that has ended, to watch it again on Instagram. */
export const isWatchAgainLink = (href: string | null | undefined) =>
  Boolean(href && /[?&]utm_campaign=embed_video_watch_again(&|$)/.test(href))

/** A profile or one of its tabs, the pages whose pictures are a grid of posts. */
export const isProfileGridPage = (hostname: string, pathname: string) =>
  getProfileUsername(hostname, pathname.replace(/\/(reels|tagged)\/?$/, '/')) !== null

/**
 * A visitor without an account gets a grid whose tiles are pictures with no link, and
 * a tap on one goes to a page asking for the app. The post is known all the same, from
 * the picture's address, so a tap opens it in a tab of this browser, as a tap on a link would.
 */
export function initInstagramPostOpener() {
  if (!/(^|\.)instagram\.com$/.test(document.location.hostname)) {
    return () => {}
  }

  // A visitor's post page is swapped for its embed page, also when the site moves to it
  // without loading a page, which is why this is checked again as the page changes.
  const redirectPostPage = () => {
    if (window.top !== window || !window.Nora?.getSettings?.().anonymousMode) {
      return
    }
    const embedUrl = getEmbedUrlForPage(document.location.hostname, document.location.pathname)
    if (embedUrl) {
      document.location.replace(embedUrl)
    }
  }

  // When a video on an embed page has ended it goes back to the start and offers to watch it
  // again on Instagram, as a link to the post's own page, which asks for the app. Here it plays
  // again where it is.
  document.addEventListener(
    'click',
    (event) => {
      if (!window.Nora?.getSettings?.().anonymousMode || !/\/embed\/?$/.test(document.location.pathname)) {
        return
      }
      const link = (event.target as Element | null)?.closest?.('a')
      const video = document.querySelector('video')
      if (video && link && isWatchAgainLink(link.getAttribute('href'))) {
        event.preventDefault()
        event.stopImmediatePropagation()
        video.currentTime = 0
        void video.play().catch(() => {})
      }
    },
    true,
  )

  document.addEventListener(
    'click',
    (event) => {
      if (!window.Nora?.getSettings?.().anonymousMode || !isProfileGridPage(document.location.hostname, document.location.pathname)) {
        return
      }
      // A tile may sit inside a link of the page's own, which would take the tap to the app, so
      // a link around the picture is no reason to leave it alone. Only a picture of a post under
      // the finger is taken over; everything else keeps doing what the page made it do.
      for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
        const url = element instanceof HTMLImageElement ? getPostUrl(element.currentSrc || element.src) : null
        if (url) {
          event.preventDefault()
          event.stopImmediatePropagation()
          // The app opens it as the desktop site, which is where the player is.
          emit('open-anonymous-tab', { url })
          return
        }
      }
    },
    true,
  )

  redirectPostPage()
  return redirectPostPage
}
