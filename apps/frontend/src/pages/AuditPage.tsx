import { Card } from '../components/ui'

export default function AuditPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-slate-500 mt-1">Per-order timelines are on each order's detail page.</p>
      </div>
      <Card>
        <p className="text-sm text-slate-500">
          Open any order (Orders → click ID) to see its complete event history, actor, and payload diffs.
        </p>
      </Card>
    </div>
  )
}
