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
    return
  }

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
}
