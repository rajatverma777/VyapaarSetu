import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import {
  ChevronDown, LayoutDashboard, ShoppingCart, Package, Boxes, Users,
  Truck, CreditCard, BarChart2, RotateCcw, ScanLine, FileText, Settings,
  Check, Sun, Moon, LogOut
} from 'lucide-react'

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

export default function TopNavbar({ visible = true }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { dark, toggle: toggleTheme } = useTheme()
  const [brandMenuOpen, setBrandMenuOpen] = useState(false)
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

  const currentLabel = ROUTE_LABELS[location.pathname]
    || (location.pathname.startsWith('/documents/') ? 'Letterhead Editor' : 'VyapaarSetu')

  const isHidden = !visible && !brandMenuOpen

  return (
    <div className={`top-navbar no-print ${isHidden ? 'top-navbar--hidden' : ''}`}>
      {/* Centered Brand Wordmark & Dropdown — Inspired by Instagram & Facebook */}
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
            size={15}
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
            <div className="max-h-[340px] overflow-y-auto space-y-0.5 pr-0.5">
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

            {/* Subtle Divider */}
            <div className="my-1 border-t border-black/[0.06] dark:border-white/[0.08]" />

            {/* Quick Actions: Theme Toggle & Logout */}
            <div className="pt-0.5 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  toggleTheme()
                }}
                className="brand-nav-item"
              >
                <span className="brand-nav-item-icon">
                  {dark ? <Sun size={15} className="text-amber-500" /> : <Moon size={15} className="text-[#0071e3]" />}
                </span>
                <span className="flex-1 truncate">{dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setBrandMenuOpen(false)
                  logout()
                }}
                className="brand-nav-item hover:text-red-600 dark:hover:text-red-400"
              >
                <span className="brand-nav-item-icon">
                  <LogOut size={15} className="text-red-500" />
                </span>
                <span className="flex-1 truncate">Sign Out</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[80px]">
                  {user?.full_name?.split(' ')[0] || user?.role}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
