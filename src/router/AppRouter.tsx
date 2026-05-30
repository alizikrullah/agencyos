import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/layout/Layout'
import LoginPage from '../pages/LoginPage'
import DashboardPage from '../pages/DashboardPage'
import ClientsPage from '../pages/ClientsPage'
import ClientDetailPage from '../pages/ClientDetailPage'
import FinancePage from '../pages/FinancePage'
import InvoicePage from '../pages/InvoicePage'
import SalaryPage from '../pages/SalaryPage'

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="spinner" />
      <p className="text-muted" style={{ fontSize: 13 }}>Loading...</p>
    </div>
  )
}

function PrivateRoute() {
  const { user, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

function PublicRoute() {
  const { user, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (user) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<PrivateRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"          element={<DashboardPage />} />
            <Route path="/clients"            element={<ClientsPage />} />
            <Route path="/clients/:slug"      element={<ClientDetailPage />} />
            <Route path="/finance"            element={<FinancePage />} />
            <Route path="/doc-studio"         element={<Navigate to="/doc-studio/invoice" replace />} />
            <Route path="/doc-studio/invoice" element={<InvoicePage />} />
            <Route path="/doc-studio/salary"  element={<SalaryPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
