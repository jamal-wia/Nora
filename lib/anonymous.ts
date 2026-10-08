/**
 * The profile that holds browsing done without an account. It is an ordinary
 * profile -- its own cookies and storage, listed with the others -- under a
 * fixed id, so that the anonymous mode and public search can tell which tabs
 * are meant to be account-free.
 */
export const ANONYMOUS_PROFILE_ID = 'anonymous'
export const ANONYMOUS_PROFILE_NAME = 'Anonymous'
export const ANONYMOUS_PROFILE_COLOR = '#475569'

export function isAnonymousProfile(profileId?: string | null) {
  return profileId === ANONYMOUS_PROFILE_ID
}
