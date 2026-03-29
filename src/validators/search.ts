import { z } from 'zod'
import { ApiError, type AppError } from '../shared/errors'
import type { Result } from '../shared/result'
import type { Language } from '../shared/types'

const SearchParamsSchema = z.object({
  q: z
    .string()
    .min(1, 'query is required')
    .max(200, 'query too long')
    .transform((s) => s.trim()),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(40).default(20),
  language: z
    .string()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'invalid language format')
    .default('en-US')
    .transform((s) => s as Language),
  year: z.coerce.number().int().min(1888).max(2030).optional(),
})

export type SearchParams = z.infer<typeof SearchParamsSchema>

export const validateSearch = (
  raw: Record<string, string | undefined> | null,
): Result<SearchParams, AppError> => {
  const parsed = SearchParamsSchema.safeParse(raw ?? {})

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    return ApiError('VALIDATION_ERROR', { reason: issues })
  }

  return parsed.data
}
