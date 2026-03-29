import type { ApiErrorCode, AppError, InternalErrorCode } from '../shared/errors'
import { securityHeaders } from './security-headers'

type ErrorResponse = {
  statusCode: number
  headers: Record<string, string>
  body: string
}

const STATUS_MAP: Record<ApiErrorCode | InternalErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  CIRCUIT_OPEN: 503,
  TMDB_UNAVAILABLE: 503,
  TMDB_NOT_FOUND: 404,
  TMDB_RATE_LIMITED: 502,
  CACHE_READ_ERROR: 500,
  CACHE_WRITE_ERROR: 500,
  SECRET_NOT_FOUND: 500,
  UNKNOWN_ERROR: 500,
}

export const mapErrorToResponse = (error: AppError): ErrorResponse => ({
  statusCode: STATUS_MAP[error.errorCode] ?? 500,
  headers: securityHeaders,
  body: JSON.stringify({
    error: {
      code: error.errorCode,
      message: error.showError
        ? (error.errorReason?.reason ?? error.errorCode)
        : 'Internal server error',
    },
  }),
})
