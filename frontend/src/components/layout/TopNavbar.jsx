import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { useCommandPalette } from '../../context/CommandPaletteContext'
import { FloatingUserMenu } from '../ui'
import { Search, Sun, Moon, Menu, Command } from 'lucide-react'
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

export default function TopNavbar({ onMenuToggle }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const { open: openPalette } = useCommandPalette()
  const [status, setStatus] = useState('connecting') // 'connecting' | 'online' | 'offline'
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const avatarRef = useRef(null)

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

  return (
    <div className="top-navbar no-print">
      {/* Mobile menu toggle */}
      <button
        className="navbar-icon-btn lg:hidden flex-shrink-0"
        onClick={onMenuToggle}
        aria-label="Toggle menu"
      >
        <Menu size={16} />
      </button>

      {/* Page Title */}
      <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
        <span
          className="text-sm font-bold text-gray-800 dark:text-gray-100"
          style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", letterSpacing: '-0.01em' }}
        >
          {currentLabel}
        </span>
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
