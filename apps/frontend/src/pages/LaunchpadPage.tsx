import { Bike, Copy, ExternalLink, LayoutDashboard, MapPin, ShoppingBag, type LucideIcon } from 'lucide-react'
import { Button, Card, Textarea, toast } from '../components/ui'

interface LaunchpadLink {
  name: string
  url: string
  icon: LucideIcon
  iconBg: string
  iconColor: string
}

const LINKS: LaunchpadLink[] = [
  {
    name: 'Admin Dashboard',
    url: 'https://pullup.aegisassetllc.com',
    icon: LayoutDashboard,
    iconBg: 'bg-brand-100',
    iconColor: 'text-brand-700',
  },
  {
    name: 'Rider App',
    url: 'https://pulluprider.aegisassetllc.com',
    icon: Bike,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
  },
  {
    name: 'Customer App',
    url: 'https://pullupcustomer.aegisassetllc.com/order',
    icon: ShoppingBag,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-700',
  },
  {
    name: 'Order Tracking',
    url: 'https://pullupcustomer.aegisassetllc.com',
    icon: MapPin,
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-700',
  },
]

const SHARE_TEXT = LINKS.map(link => `${link.name}: ${link.url}`).join('\n')

export default function LaunchpadPage() {
  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(successMessage)
    } catch {
      toast.error('Could not copy link')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">App Links</h1>
        <p className="mt-1 text-sm text-slate-500">Quickly open and share the PullUp app ecosystem.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {LINKS.map(link => {
          const Icon = link.icon

          return (
            <Card key={link.name} className="border border-slate-200 shadow-sm">
              <div className="flex h-full flex-col gap-4">
                <div>
                  <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${link.iconBg} ${link.iconColor}`}>
                    <Icon size={22} />
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900">{link.name}</h2>
                  <p className="mt-2 break-all text-sm text-slate-500">{link.url}</p>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
                    icon={<ExternalLink size={14} />}
                  >
                    Open
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => copyText(link.url, `${link.name} link copied`)}
                    icon={<Copy size={14} />}
                  >
                    Copy link
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Card title="Share links" className="border border-slate-200 shadow-sm">
        <div className="space-y-3">
          <Textarea value={SHARE_TEXT} readOnly rows={6} className="font-mono text-sm" />
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => copyText(SHARE_TEXT, 'All app links copied')} icon={<Copy size={14} />}>
              Copy all links
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
