import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { useCommandPalette } from '../../context/CommandPaletteContext'
import { FloatingUserMenu } from '../ui'
import {
  Search, Sun, Moon, Menu, Command, ChevronDown,
  LayoutDashboard, ShoppingCart, Package, Boxes, Users,
  Truck, CreditCard, BarChart2, RotateCcw, ScanLine, FileText, Settings, Check
} from 'lucide-react'
import { healthAPI } from '../../services/api'

const ROUTE_LABELS = {
  '/dashboard': 'Dashboard',
  '/products': 'Products',
  '/customers': 'Customers',
  '/suppliers': 'Suppliers',
  '/sales': 'Sales',
  '/sales/new': 'New Sale',
  '/purchases': 'Purchases',
  '/purchases/new': 'New Purchase',
  '/inventory': 'Inventory',
  '/returns': 'Returns',
  '/traceability': 'Traceability',
  '/payments': 'Payments',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/documents': 'Letterheads',
  '/documents/new': 'New Letterhead',
}

const NAV_MODULES = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/sales', label: 'Billing & Sales', icon: ShoppingCart },
  { path: '/products', label: 'Products Catalog', icon: Package },
  { path: '/inventory', label: 'Inventory & Stock', icon: Boxes },
  { path: '/customers', label: 'Customers & Khata', icon: Users },
  { path: '/suppliers', label: 'Suppliers & Vendors', icon: Truck },
  { path: '/payments', label: 'Payments & Dues', icon: CreditCard },
  { path: '/reports', label: 'GST & Reports', icon: BarChart2 },
  { path: '/returns', label: 'Returns Center', icon: RotateCcw },
  { path: '/traceability', label: 'Batch Traceability', icon: ScanLine },
  { path: '/documents', label: 'Letterheads', icon: FileText },
  { path: '/settings', label: 'Settings', icon: Settings },
]

function ThemeCycleBtn() {
  const { dark, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className="navbar-icon-btn"
      title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  )
}

export default function TopNavbar({ visible = true }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const { open: openPalette } = useCommandPalette()
  const [status, setStatus] = useState('connecting') // 'connecting' | 'online' | 'offline'
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const [brandMenuOpen, setBrandMenuOpen] = useState(false)
  const avatarRef = useRef(null)
  const brandRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (brandRef.current && !brandRef.current.contains(e.target)) {
        setBrandMenuOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setBrandMenuOpen(false)
    }
    if (brandMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [brandMenuOpen])

  useEffect(() => {
    setBrandMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    let active = true

    const checkConnection = async () => {
      if (!navigator.onLine) {
        if (active) setStatus('offline')
        return
      }
      try {
        await healthAPI.check()
        if (active) setStatus('online')
      } catch (e) {
        if (active) setStatus('offline')
      }
    }

    // Initial check
    checkConnection()

    // Interval check every 8 seconds
    const interval = setInterval(checkConnection, 8000)

    const onOnline  = () => {
      if (active) {
        setStatus('connecting')
        checkConnection()
      }
    }
    const onOffline = () => {
      if (active) setStatus('offline')
    }

    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      active = false
      clearInterval(interval)
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const handleAvatarClick = (e) => {
    e.stopPropagation()
    if (avatarRef.current) {
      setMenuAnchor(avatarRef.current.getBoundingClientRect())
      setMenuOpen(!menuOpen)
    }
  }

  const currentLabel = ROUTE_LABELS[location.pathname]
    || (location.pathname.startsWith('/documents/') ? 'Letterhead Editor' : 'VyapaarSetu')

  const isHidden = !visible && !menuOpen && !brandMenuOpen

  return (
    <div className={`top-navbar no-print ${isHidden ? 'top-navbar--hidden' : ''}`}>
      {/* Brand Wordmark & Dropdown — Inspired by Instagram & Facebook */}
      <div className="app-brand-container" ref={brandRef}>
        <button
          type="button"
          onClick={() => setBrandMenuOpen(prev => !prev)}
          className="app-brand-btn group focus:outline-none"
          title="VyapaarSetu — Switch section"
          aria-expanded={brandMenuOpen}
        >
          <span className="app-brand-logo-text">
            VyapaarSetu
          </span>
          <ChevronDown
            size={14}
            strokeWidth={2.4}
            className={`app-brand-chevron ${brandMenuOpen ? 'app-brand-chevron--open' : ''}`}
          />
        </button>

        {/* Apple Liquid Glass Quick Navigation Dropdown */}
        {brandMenuOpen && (
          <div className="brand-nav-dropdown">
            <div className="brand-nav-dropdown-header">
              <span className="brand-nav-dropdown-title">Switch Module</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{currentLabel}</span>
            </div>
            <div className="max-h-[380px] overflow-y-auto space-y-0.5 pr-0.5">
              {NAV_MODULES.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path ||
                  (item.path !== '/dashboard' && location.pathname.startsWith(item.path))
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => {
                      navigate(item.path)
                      setBrandMenuOpen(false)
                    }}
                    className={`brand-nav-item ${isActive ? 'brand-nav-item--active' : ''}`}
                  >
                    <span className="brand-nav-item-icon">
                      <Icon size={15} />
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {isActive && (
                      <Check size={14} className="text-[#0071e3] dark:text-[#5ac8fa] flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search Trigger */}
      <button
        className="navbar-search-trigger hidden sm:flex"
        onClick={openPalette}
        aria-label="Open command palette"
      >
        <Search size={13} />
        <span>Search or jump to…</span>
        <span className="ml-auto flex items-center gap-1">
          <kbd className="cmd-item-shortcut flex items-center gap-0.5">
            <Command size={9} />K
          </kbd>
        </span>
      </button>

      {/* Connection Status */}
      {status === 'online' && (
        <div className="navbar-status-pill navbar-status-online hidden md:flex flex-shrink-0">
          <span className="live-dot" />
          Live
        </div>
      )}
      {status === 'connecting' && (
        <div className="navbar-status-pill navbar-status-connecting hidden md:flex flex-shrink-0">
          <span className="live-dot" />
          Connecting
        </div>
      )}
      {status === 'offline' && (
        <div className="navbar-status-pill navbar-status-offline hidden md:flex flex-shrink-0">
          <span className="live-dot" />
          Offline
        </div>
      )}

      {/* Theme Toggle */}
      <ThemeCycleBtn />

      {/* User Avatar */}
      <button
        ref={avatarRef}
        onClick={handleAvatarClick}
        className="navbar-avatar focus:outline-none"
        title={`${user?.full_name} (${user?.role})`}
      >
        {user?.full_name?.[0]?.toUpperCase() || 'U'}
      </button>

      {/* Portal Dropdown Menu */}
      <FloatingUserMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRect={menuAnchor}
        user={user}
        dark={dark}
        onToggleTheme={toggle}
        onLogout={logout}
        onNavigate={navigate}
      />
    </div>
  )
}
