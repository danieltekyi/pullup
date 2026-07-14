import { Outlet } from 'react-router-dom'
import { AdminLayout } from './AdminLayout'

export function LayoutWithSidebar() {
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  )
}
