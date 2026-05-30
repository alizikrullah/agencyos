import { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import ChatAssistant from '../ChatAssistant'
import {
  LayoutDashboard,
  Users,
  DollarSign,
  FileText,
  Receipt,
  LogOut,
  ChevronDown,
  FileSignature,
  PanelLeft,
  Sun,
  Moon,
} from 'lucide-react'

function titleFromPath(p: string): string {
  if (p.startsWith('/dashboard')) return 'Dashboard'
  if (p.startsWith('/clients/')) return 'Detail Klien'
  if (p.startsWith('/clients')) return 'Clients'
  if (p.startsWith('/finance')) return 'Finance'
  if (p.startsWith('/doc-studio/invoice')) return 'Invoice'
  if (p.startsWith('/doc-studio/salary')) return 'Slip Gaji'
  return 'AgencyOS'
}

export default function Layout() {
  const { user, isDemo, logout, exitDemo } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const isDocStudio = location.pathname.startsWith('/doc-studio')
  const [docOpen, setDocOpen] = useState(isDocStudio)
  const [collapsed, setCollapsed] = useState(false)

  const handleLogout = async () => {
    if (isDemo) exitDemo()
    else await logout()
    navigate('/login')
  }

  const initials = user?.email?.charAt(0).toUpperCase() ?? '?'
  const pageTitle = titleFromPath(location.pathname)

  return (
    <div className={`app-layout${collapsed ? ' sidebar-collapsed' : ''}`}>
      {/* ── Sidebar ── */}
      <aside className="sidebar no-print">
        <div className="sidebar-logo">
          <div className="sidebar-logo-text" style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
            AgencyOS
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-label">Menu</div>

          <NavLink to="/dashboard" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} title="Dashboard">
            <LayoutDashboard size={16} /> <span className="nav-text">Dashboard</span>
          </NavLink>

          <NavLink to="/clients" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} end={false} title="Clients">
            <Users size={16} /> <span className="nav-text">Clients</span>
          </NavLink>

          {/* Doc Studio with sub-nav */}
          <div>
            <button
              className={`nav-item${isDocStudio ? ' active' : ''}`}
              onClick={() => { if (collapsed) { navigate('/doc-studio/invoice'); return } setDocOpen(o => !o); if (!isDocStudio) navigate('/doc-studio/invoice') }}
              style={{ width: '100%' }}
              title="Doc Studio"
            >
              <FileText size={16} />
              <span className="nav-text">Doc Studio</span>
              <ChevronDown
                size={13}
                className="nav-chevron"
                style={{ marginLeft: 'auto', transition: 'transform 0.2s', transform: docOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>
            {docOpen && !collapsed && (
              <div style={{ paddingLeft: 10, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <NavLink to="/doc-studio/invoice" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} style={{ fontSize: 13, paddingTop: 7, paddingBottom: 7 }}>
                  <Receipt size={14} /> <span className="nav-text">Invoice</span>
                </NavLink>
                <NavLink to="/doc-studio/salary" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} style={{ fontSize: 13, paddingTop: 7, paddingBottom: 7 }}>
                  <FileSignature size={14} /> <span className="nav-text">Slip Gaji</span>
                </NavLink>
              </div>
            )}
          </div>

          <NavLink to="/finance" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} title="Finance">
            <DollarSign size={16} /> <span className="nav-text">Finance</span>
          </NavLink>
        </nav>
      </aside>

      {/* ── Main content ── */}
      <main className="main-content">
        {/* Top header bar */}
        <header className="topbar no-print">
          <div className="topbar-left">
            <button className="topbar-icon-btn" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Buka sidebar' : 'Tutup sidebar'}>
              <PanelLeft size={17} />
            </button>
            <span className="topbar-title">{pageTitle}</span>
            {isDemo && <span className="badge badge-purple" style={{ fontSize: 10 }}>Demo</span>}
          </div>

          <div className="topbar-right">
            <button className="topbar-icon-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div className="topbar-user">
              <div className="topbar-avatar">{initials}</div>
              <div className="topbar-user-meta">
                <span className="tu-email">{user?.email}</span>
                <span className="tu-role">{user?.role}</span>
              </div>
            </div>
            <button className="topbar-icon-btn" onClick={handleLogout} title={isDemo ? 'Exit Demo' : 'Logout'}>
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <Outlet />
      </main>

      {/* ── Floating AI Chat Assistant ── */}
      <ChatAssistant />
    </div>
  )
}
