import type { Language } from '../shared/types'

const LANGUAGE_RE = /^[a-z]{2}(-[A-Z]{2})?$/
const LANGUAGE_RE_I = /^[a-z]{2}(-[A-Z]{2})?$/i

const DEFAULT_LANGUAGE = 'en-US' as Language

// Priority: 1. ?language= param, 2. Accept-Language header, 3. default 'en-US'
export const detectLanguage = (
  params?: Record<string, string | undefined> | null,
  headers?: Record<string, string | undefined> | null,
): Language => {
  const explicit = params?.language
  if (explicit && LANGUAGE_RE.test(explicit)) return explicit as Language

  const header = headers?.['accept-language']
  if (header) {
    const primary = header.split(',')[0]?.split(';')[0]?.trim()
    if (primary && LANGUAGE_RE_I.test(primary)) return primary as Language
  }

  return DEFAULT_LANGUAGE
}
