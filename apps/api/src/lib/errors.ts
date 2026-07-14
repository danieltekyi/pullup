export class HttpError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown

  constructor(statusCode: number, message: string, code = 'error', details?: unknown) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export const badRequest    = (m: string, d?: unknown) => new HttpError(400, m, 'bad_request', d)
export const unauthorized  = (m = 'not authenticated') => new HttpError(401, m, 'unauthorized')
export const forbidden     = (m = 'forbidden') => new HttpError(403, m, 'forbidden')
export const notFound      = (m = 'not found') => new HttpError(404, m, 'not_found')
export const gone          = (m: string) => new HttpError(410, m, 'gone')
export const conflict      = (m: string) => new HttpError(409, m, 'conflict')
export const unprocessable = (m: string, d?: unknown) => new HttpError(422, m, 'unprocessable', d)
export const serverError   = (m = 'internal server error') => new HttpError(500, m, 'server_error')
