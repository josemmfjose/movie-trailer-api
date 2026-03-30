import { ApiError, type AppError } from '#shared/errors'
import type { Result } from '#shared/result'

export const validateMovieId = (raw: string | undefined): Result<number, AppError> => {
  if (raw == null || raw.trim() === '') {
    return ApiError('VALIDATION_ERROR', { reason: 'movie id is required' })
  }

  // Reject anything that isn't purely digits (no floats, negatives, injection attempts)
  if (!/^\d+$/.test(raw)) {
    return ApiError('VALIDATION_ERROR', { reason: 'movie id must be a positive integer' })
  }

  const id = Number(raw)

  if (id === 0) {
    return ApiError('VALIDATION_ERROR', { reason: 'movie id must be a positive integer' })
  }

  if (!Number.isSafeInteger(id)) {
    return ApiError('VALIDATION_ERROR', { reason: 'movie id out of range' })
  }

  return id
}
