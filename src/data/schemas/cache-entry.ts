import { z } from 'zod'

export const CacheEntrySchema = z.object({
  entityType: z.enum(['SEARCH', 'MOVIE', 'TRAILER']),
  cacheKey: z.string(),
  language: z.string().default('en-US'),
  data: z.string(),
  freshUntil: z.number(),
  staleUntil: z.number(),
  ttl: z.number(),
  createdAt: z.string(),
})

export type CacheEntry = z.infer<typeof CacheEntrySchema>

const compositeKey = (...parts: string[]) => parts.join('#')

export const cacheKeys = {
  pk: (entityType: string, language: string) => compositeKey(entityType, language),
  sk: (cacheKey: string) => cacheKey,
  gsi1pk: (entityType: string) => entityType,
  gsi1sk: (freshUntil: number) => String(freshUntil),
}
