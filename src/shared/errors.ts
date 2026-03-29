// --- ErrorFactory ---

type ErrorParams = {
  showError: boolean
  tag: string
  errorCode: string
  errorReason: ErrorReason | undefined
}

export type ErrorReason = {
  readonly reason?: string
  readonly [key: string]: unknown
}

export interface ErrorFactory<T extends ErrorParams> extends Error {
  readonly isError: true
  readonly tag: T['tag']
  readonly errorCode: T['errorCode']
  readonly errorReason: T['errorReason']
  readonly showError: T['showError']
}

export const ErrorFactory = <const T extends ErrorParams>(params: T): ErrorFactory<T> => {
  const message = params.errorReason
    ? `${params.errorCode}: ${JSON.stringify(params.errorReason)}`
    : params.errorCode
  const error = new Error(message)
  return Object.assign(error, {
    isError: true as const,
    tag: params.tag,
    errorCode: params.errorCode,
    errorReason: params.errorReason,
    showError: params.showError,
  }) as ErrorFactory<T>
}

// --- API Errors (shown to client) ---

export type ApiErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'RATE_LIMITED' | 'UNAUTHORIZED'

export type ApiError<T extends ApiErrorCode = ApiErrorCode> = ErrorFactory<{
  errorCode: T
  errorReason: { reason: string; [key: string]: unknown }
  tag: 'ApiError'
  showError: true
}>

export const ApiError = <T extends ApiErrorCode>(
  errorCode: T,
  errorReason: { reason: string; [key: string]: unknown },
): ApiError<T> =>
  ErrorFactory({
    errorCode,
    errorReason,
    tag: 'ApiError' as const,
    showError: true as const,
  }) as ApiError<T>

// --- Internal Errors (logged, not shown to client) ---

export type InternalErrorCode =
  | 'TMDB_UNAVAILABLE'
  | 'TMDB_NOT_FOUND'
  | 'TMDB_RATE_LIMITED'
  | 'CACHE_READ_ERROR'
  | 'CACHE_WRITE_ERROR'
  | 'SECRET_NOT_FOUND'
  | 'CIRCUIT_OPEN'
  | 'UNKNOWN_ERROR'

export type InternalError<T extends InternalErrorCode = InternalErrorCode> = ErrorFactory<{
  errorCode: T
  errorReason: ErrorReason | undefined
  tag: 'InternalError'
  showError: false
}>

export const InternalError = <T extends InternalErrorCode>(
  errorCode: T,
  errorReason?: ErrorReason,
): InternalError<T> =>
  ErrorFactory({
    errorCode,
    errorReason,
    tag: 'InternalError' as const,
    showError: false as const,
  }) as InternalError<T>

// --- Union ---

export type AppError = ApiError | InternalError
