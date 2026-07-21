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
  withCredentials: true,
})

// Attach rider session token from localStorage if present
api.interceptors.request.use(config => {
  try {
    const token = localStorage.getItem('rider_session')
    if (token) config.headers.set('Authorization', `Bearer ${token}`)
  } catch { /* localStorage may not be available */ }
  return config  // sends CF_Authorization cookie cross-origin
})

api.interceptors.response.use(
  r => r,
  (err: AxiosError<{ error?: string; message?: string }>) => {
    if (err.response?.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/track')) {
        // Rider custom auth: clear token and reload to show login form.
        // Admin: reload triggers Cloudflare Access re-prompt.
        try { localStorage.removeItem('rider_session') } catch { /* ignore */ }
        window.location.replace('/')
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
  // If rider is using a custom localStorage session, just clear it and reload.
  // The app will drop back to the RiderLogin form immediately.
  try {
    if (localStorage.getItem('rider_session')) {
      localStorage.removeItem('rider_session')
      window.location.replace('/')
      return
    }
  } catch { /* ignore */ }

  // Admin/Customer: Cloudflare Access team logout with redirect back to origin.
  const returnUrl = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''
  window.location.replace(
    `https://aegis-dashboard.cloudflareaccess.com/cdn-cgi/access/logout${returnUrl ? `?redirect=${returnUrl}` : ''}`,
  )
}
