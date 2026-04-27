import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { aircraft, reqs } from '../api.js'

const NAV = [
  { section: 'Operations', items: [
    { to: '/',             label: 'Dashboard',    icon: '⬛' },
    { to: '/inventory',    label: 'Inventory',    icon: '📦' },
    { to: '/requisitions', label: 'Requisitions', icon: '📋', badge: 'reqs' },
    { to: '/aircraft',     label: 'Aircraft',     icon: '✈️',  badge: 'nmcs' },
    { to: '/parts',        label: 'Parts DB',     icon: '🔩' },
    { to: '/repairables',  label: 'Repairables',  icon: '🔧' },
  ]},
  { section: 'Analysis', items: [
    { to: '/reports',      label: 'Reports',      icon: '📊' },
  ]},
  { section: 'System', items: [
    { to: '/admin',        label: 'Admin',        icon: '⚙️' },
  ]},
]

const PAGE_TITLES = {
  '/':             'Dashboard',
  '/inventory':    'Inventory',
  '/requisitions': 'Requisitions',
  '/aircraft':     'Aircraft & NMCS',
  '/parts':        'Parts Catalog',
  '/reports':      'Reports',
  '/admin':        'Administration',
  '/repairables':  'Repairables & DIFM',
}

export default function Layout() {
  const location = useLocation()
  const [badges, setBadges] = useState({ nmcs: 0, reqs: 0 })
  const title = PAGE_TITLES[location.pathname] || 'Aviation IMS'

  useEffect(() => {
    Promise.allSettled([
      aircraft.nmcsOpen(),
      reqs.list({ open: true }),
    ]).then(([nmcsRes, reqsRes]) => {
      setBadges({
        nmcs: nmcsRes.status === 'fulfilled' ? (nmcsRes.value.data?.count || 0) : 0,
        reqs: reqsRes.status === 'fulfilled' ? (reqsRes.value.data?.count || 0) : 0,
      })
    })
  }, [location.pathname])

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-text">
            <strong>Aviation IMS</strong>
            <small>Metron Matrix Solutions</small>
          </div>
        </div>

        {NAV.map(({ section, items }) => (
          <div key={section} className="sidebar-section">
            <span className="sidebar-label">{section}</span>
            {items.map(({ to, label, icon, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <span className="nav-icon">{icon}</span>
                {label}
                {badge === 'nmcs' && badges.nmcs > 0 && (
                  <span className="nav-badge">{badges.nmcs}</span>
                )}
                {badge === 'reqs' && badges.reqs > 0 && (
                  <span className="nav-badge amber">{badges.reqs}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Topbar */}
      <header className="topbar">
        <span className="topbar-title">{title}</span>
        <div className="topbar-actions">
          <span className="text-dim" style={{ fontSize: 12 }}>DEV MODE</span>
        </div>
      </header>

      {/* Page content */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
