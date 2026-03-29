export const buildSearchCacheKey = (params: {
  q: string
  page: number
  language: string
}): string => {
  const normalized = params.q.trim().toLowerCase().replace(/\s+/g, ' ')
  return `SEARCH:${params.language}:${normalized}:${params.page}`
}

export const buildDetailCacheKey = (id: number, language: string): string =>
  `MOVIE:${language}:${id}`

export const buildTrailersCacheKey = (id: number, language: string): string =>
  `TRAILER:${language}:${id}`
