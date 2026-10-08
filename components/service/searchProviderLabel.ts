import { t } from 'i18next'

/** The brands are names; the public posts provider is a phrase, and is translated. */
export const getProviderLabel = (provider: { kind: string; name: string }) =>
  provider.kind === 'public' ? t('newTab.search.publicProvider') : provider.name
