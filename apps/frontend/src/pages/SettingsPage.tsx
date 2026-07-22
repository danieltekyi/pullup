import { useEffect, useState } from 'react'
import { Card, Button, toast } from '../components/ui'
import { subscribeToPush, unsubscribeFromPush } from '../services/push'
import { Bell, BellOff, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { api, apiErrorMessage } from '../services/api'

export default function SettingsPage() {
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushEnabled(false)
      return
    }
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => setPushEnabled(!!sub)),
    )
  }, [])

  async function togglePush() {
    if (pushEnabled) {
      await unsubscribeFromPush()
      setPushEnabled(false)
      toast.success('Push notifications turned off')
    } else {
      const ok = await subscribeToPush()
      if (ok) {
        setPushEnabled(true)
        toast.success('Push notifications enabled')
      } else {
        toast.error('Could not enable push notifications')
      }
    }
  }

  async function uploadCsv(file: File) {
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post<{ imported: number }>('/api/orders/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success(`✅ Imported ${res.data.imported} orders successfully`)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Bulk Orders */}
      <Card title="Bulk order import">
        <p className="text-sm text-slate-500 mb-4">
          Download the Excel template, fill in your orders, then upload it to import them all at once.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="/PullUp_Bulk_Order_Template.xlsx"
            download="PullUp_Bulk_Order_Template.xlsx"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg"
          >
            <FileSpreadsheet size={16} />
            Download Excel template
          </a>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg cursor-pointer">
            <Upload size={16} />
            {importing ? 'Importing…' : 'Upload filled template'}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={e => e.target.files?.[0] && uploadCsv(e.target.files[0])}
              disabled={importing}
            />
          </label>
        </div>
        <div className="mt-4 bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1">
          <p className="font-semibold text-slate-700">How to use:</p>
          <p>1. Download the Excel template above</p>
          <p>2. Fill in sender, recipient, and delivery details (one row per order)</p>
          <p>3. Save as CSV (File → Save As → CSV) or keep as xlsx</p>
          <p>4. Click "Upload filled template" — all orders imported instantly</p>
        </div>
      </Card>

      {/* Push notifications */}
      <Card title="Push notifications">
        <p className="text-sm text-slate-500 mb-3">
          Get alerts on this device when new orders are assigned or status changes happen.
        </p>
        <Button
          variant={pushEnabled ? 'secondary' : 'primary'}
          icon={pushEnabled ? <BellOff size={16} /> : <Bell size={16} />}
          onClick={togglePush}
          disabled={pushEnabled === null}
        >
          {pushEnabled === null ? 'Loading…' : pushEnabled ? 'Turn off' : 'Enable push notifications'}
        </Button>
      </Card>

      {/* About */}
      <Card title="About">
        <p className="text-sm text-slate-500">
          PullUp Delivery v2.0 — Aegis Asset Management.<br />
          Admin: <a href="https://pullup.aegisassetllc.com" className="text-brand-600">pullup.aegisassetllc.com</a>
          {' · '}Rider: <a href="https://pulluprider.aegisassetllc.com" className="text-brand-600">pulluprider.aegisassetllc.com</a>
          {' · '}Customer: <a href="https://pullupcustomer.aegisassetllc.com" className="text-brand-600">pullupcustomer.aegisassetllc.com</a>
        </p>
      </Card>
    </div>
  )
}
