import { tableEntry } from 'rotorise'
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

// Not exported — avoids TS7056 (rotorise's inferred type exceeds serialization limit).
// The `const` generic on tableEntry preserves tuple types from the inline schema.
const table = tableEntry<CacheEntry>()({
  PK: ['entityType', 'language'],
  SK: ['cacheKey'],
})

export const cacheTable = {
  toEntry: (item: CacheEntry) => table.toEntry(item),
  pk: (attrs: Pick<CacheEntry, 'entityType' | 'language'>) => table.key('PK', attrs),
  sk: (attrs: Pick<CacheEntry, 'cacheKey'>) => table.key('SK', attrs),
}
