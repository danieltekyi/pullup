/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_COGNITO_REGION: string
  readonly VITE_COGNITO_USER_POOL_ID: string
  readonly VITE_COGNITO_APP_CLIENT_ID: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_APP_MODE?: 'admin' | 'rider' | 'customer'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
