import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PermissionsProvider } from './context/PermissionsContext'
import { ProtectedRoute, RiderOnlyRoute } from './components/layout/ProtectedRoute'
import { LayoutWithSidebar } from './components/layout/Layout'
import { ToastViewport } from './components/ui'
import { startOnlineListener } from './offline/sync'

import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import OrdersPage from './pages/OrdersPage'
import OrderDetailPage from './pages/OrderDetailPage'
import RidersPage from './pages/RidersPage'
import FleetPage from './pages/FleetPage'
import PartnersPage from './pages/PartnersPage'
import FinancePage from './pages/FinancePage'
import CustomersPage from './pages/CustomersPage'
import UsersPage from './pages/UsersPage'
import BranchesPage from './pages/BranchesPage'
import ZonesPage from './pages/ZonesPage'
import PhysicsPricingPage from './pages/PhysicsPricingPage'
import SettingsPage from './pages/SettingsPage'
import AuditPage from './pages/AuditPage'
import TrackPage from './pages/TrackPage'
import RiderHome from './pages/rider/RiderHome'

function AppShell() {
  const { user } = useAuth()

  useEffect(() => {
    startOnlineListener()
  }, [])

  return (
    <>
      <ToastViewport />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/track" element={<TrackPage />} />

        {/* Rider mobile app */}
        <Route element={<RiderOnlyRoute />}>
          <Route path="/rider" element={<RiderHome />} />
        </Route>

        {/* Admin (managers + super-admins) */}
        <Route element={<ProtectedRoute />}>
          <Route element={<LayoutWithSidebar />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/riders" element={<RidersPage />} />
            <Route path="/fleet" element={<FleetPage />} />
            <Route path="/partners" element={<PartnersPage />} />
            <Route path="/finance" element={<FinancePage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/branches" element={<BranchesPage />} />
            <Route path="/zones" element={<ZonesPage />} />
            <Route path="/physics-pricing" element={<PhysicsPricingPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to={user?.role === 'rider' ? '/rider' : '/'} replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <PermissionsProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </PermissionsProvider>
    </AuthProvider>
  )
}
