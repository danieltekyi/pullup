import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

type AppMode = 'admin' | 'rider' | 'customer'

const MANIFESTS: Record<AppMode, { name: string; short_name: string; description: string; theme: string; bg: string }> = {
  admin: {
    name: 'PullUp Admin',
    short_name: 'PullUp',
    description: 'Delivery management console',
    theme: '#4f46e5',
    bg: '#0f172a',
  },
  rider: {
    name: 'PullUp Rider',
    short_name: 'Rider',
    description: 'PullUp delivery rider app',
    theme: '#16a34a',
    bg: '#052e16',
  },
  customer: {
    name: 'PullUp Track',
    short_name: 'Track',
    description: 'Track your PullUp delivery',
    theme: '#4f46e5',
    bg: '#ffffff',
  },
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const appMode: AppMode = ((env.VITE_APP_MODE as AppMode) || 'admin')
  const m = MANIFESTS[appMode]

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'icons/icon-192.png', 'icons/icon-512.png'],        manifest: {
          name: m.name,
          short_name: m.short_name,
          description: m.description,
          theme_color: m.theme,
          background_color: m.bg,
          display: 'standalone',
          scope: '/',
          start_url: '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/orders'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-orders',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
              },
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|webp)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images',
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
    define: {
      __APP_MODE__: JSON.stringify(appMode),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: 'http://localhost:3000', changeOrigin: true },
      },
    },
    build: {
      // Each build mode gets its own output directory so Cloudflare Pages can
      // deploy them independently: dist-admin / dist-rider / dist-customer.
      outDir: `dist-${appMode}`,
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
          },
        },
      },
    },
  }
})
