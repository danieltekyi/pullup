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

export const badRequest = (msg: string, details?: unknown) =>
  new HttpError(400, msg, 'bad_request', details)
export const unauthorized = (msg = 'not authenticated') => new HttpError(401, msg, 'unauthorized')
export const forbidden = (msg = 'forbidden') => new HttpError(403, msg, 'forbidden')
export const notFound = (msg = 'not found') => new HttpError(404, msg, 'not_found')
export const conflict = (msg: string) => new HttpError(409, msg, 'conflict')
export const unprocessable = (msg: string, details?: unknown) =>
  new HttpError(422, msg, 'unprocessable', details)
export const gone = (msg: string) => new HttpError(410, msg, 'gone')
export const serverError = (msg = 'internal server error') => new HttpError(500, msg, 'server_error')
