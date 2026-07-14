import axios, { AxiosError } from 'axios'
import { fetchAuthSession } from 'aws-amplify/auth'

const baseURL = import.meta.env.VITE_API_URL || ''

export const api = axios.create({ baseURL, timeout: 20_000 })

api.interceptors.request.use(async config => {
  try {
    const session = await fetchAuthSession()
    // Prefer access token — matches backend token_use='access' check.
    const token = session.tokens?.accessToken?.toString() || session.tokens?.idToken?.toString()
    if (token) config.headers.set('Authorization', `Bearer ${token}`)
  } catch {
    // unauthenticated — request will 401 if the route requires auth
  }
  return config
})

api.interceptors.response.use(
  r => r,
  (err: AxiosError<{ error: string; message: string }>) => {
    // Bubble structured server errors up unchanged; components can inspect err.response.
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
