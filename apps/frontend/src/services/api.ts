import axios, { AxiosError } from 'axios'

/**
 * When the frontend and API share a domain (they do — Worker routes are bound to
 * /api/* on each frontend subdomain), an empty baseURL yields same-origin requests.
 * Cloudflare Access cookies flow automatically. For local dev, set VITE_API_URL
 * to your Miniflare URL.
 */
const baseURL = import.meta.env.VITE_API_URL || ''

/**
 * Cloudflare Access handles auth entirely at the edge — the browser gets a
 * CF_Authorization cookie on the same registrable domain (aegisassetllc.com).
 * `withCredentials: true` sends that cookie on every API call so the Worker
 * can extract the JWT via the Cf-Access-Jwt-Assertion header Cloudflare adds.
 *
 * If the session expires, Cloudflare returns a 302 to its login page. We
 * detect that by looking at 401s (Access redirects normal requests but XHR
 * gets the 401) and force a full-page navigation so Access can re-prompt.
 */
export const api = axios.create({
  baseURL,
  timeout: 20_000,
  withCredentials: true,  // sends CF_Authorization cookie cross-origin
})

api.interceptors.response.use(
  r => r,
  (err: AxiosError<{ error?: string; message?: string }>) => {
    if (err.response?.status === 401) {
      // Session expired — force reload so Cloudflare Access shows the login page.
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/track')) {
        window.location.reload()
      }
    }
    return Promise.reject(err)
  },
)

export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.message || err.response?.data?.error || err.message
  }
  if (err instanceof Error) return err.message
  return String(err)
}

export function logout(): void {
  // Cloudflare Access logout — invalidates the session cookie.
  window.location.href = '/cdn-cgi/access/logout'
}
