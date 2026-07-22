import { useEffect, useState } from 'react'
import { Download, X, Share, MoreVertical } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'pwa-install-dismissed'

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }
    // Already dismissed
    if (localStorage.getItem(DISMISSED_KEY)) return

    // Detect iOS (Safari)
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream
    setIsIOS(ios)

    if (ios) {
      // Show iOS instructions banner after 3 seconds
      const t = setTimeout(() => setShowBanner(true), 3000)
      return () => clearTimeout(t)
    }

    // Android/Chrome — listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShowBanner(false)
  }

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setIsInstalled(true)
    setShowBanner(false)
  }

  if (!showBanner || isInstalled) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-3 animate-in slide-in-from-bottom-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl border border-slate-200 p-4">
        <button onClick={dismiss} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X size={16} />
        </button>

        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
            <Download size={22} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 text-sm">Install PullUp App</p>
            <p className="text-xs text-slate-500 mt-0.5">Add to your home screen for quick access — works offline too</p>

            {isIOS ? (
              <div className="mt-3 bg-slate-50 rounded-lg p-3 text-xs text-slate-600 space-y-1.5">
                <p className="font-semibold text-slate-800">How to install on iPhone:</p>
                <p className="flex items-center gap-1.5">
                  <span className="inline-flex h-5 w-5 rounded bg-blue-100 text-blue-700 items-center justify-center flex-shrink-0">1</span>
                  Tap the <Share size={12} className="inline mx-1 text-blue-500" /> Share button at the bottom
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="inline-flex h-5 w-5 rounded bg-blue-100 text-blue-700 items-center justify-center flex-shrink-0">2</span>
                  Scroll down and tap <strong>"Add to Home Screen"</strong>
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="inline-flex h-5 w-5 rounded bg-blue-100 text-blue-700 items-center justify-center flex-shrink-0">3</span>
                  Tap <strong>"Add"</strong> — done!
                </p>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={install}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5"
                >
                  <Download size={13} /> Install app
                </button>
                <button onClick={dismiss} className="text-xs text-slate-500 hover:text-slate-700 px-2">
                  Not now
                </button>
              </div>
            )}
          </div>
        </div>

        {isIOS && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 flex justify-center">
              <div className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
                <Share size={11} /> Tap Share → Add to Home Screen
              </div>
            </div>
            <button onClick={dismiss} className="text-xs text-slate-400 hover:text-slate-600 ml-2">
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
