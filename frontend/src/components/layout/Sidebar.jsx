import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import {
  LayoutDashboard, Package, Users, Truck, ShoppingCart,
  ShoppingBag, Warehouse, FileText, CreditCard,
  BarChart3, Settings, X, Building2, TrendingUp, LogOut,
  Sun, Moon, ChevronUp, RotateCcw, Activity
} from 'lucide-react'


const NAV_ITEMS = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/sales/new',  icon: ShoppingCart,    label: 'New Sale' },
  { to: '/purchases/new', icon: ShoppingBag,  label: 'New Purchase' },
  { divider: true, label: 'MASTER' },
  { to: '/products',   icon: Package,         label: 'Products' },
  { to: '/customers',  icon: Users,           label: 'Customers' },
  { to: '/suppliers',  icon: Truck,           label: 'Suppliers' },
  { divider: true, label: 'TRANSACTIONS' },
  { to: '/sales',      icon: TrendingUp,      label: 'Sales' },
  { to: '/purchases',  icon: ShoppingBag,     label: 'Purchases' },
  { to: '/payments',   icon: CreditCard,      label: 'Payments' },
  { divider: true, label: 'MANAGEMENT' },
  { to: '/inventory',  icon: Warehouse,       label: 'Inventory' },
  { to: '/returns',    icon: RotateCcw,       label: 'Returns' },
  { to: '/traceability', icon: Activity,      label: 'Traceability' },
  { to: '/reports',    icon: BarChart3,       label: 'Reports' },
  { to: '/settings',   icon: Settings,        label: 'Settings' },
]

export default function Sidebar({ onClose }) {
  const { user, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef()

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="card h-full flex flex-col backdrop-blur-2xl text-gray-900 dark:text-gray-100">
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200/40 dark:border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 glass-icon-container text-gray-800 dark:text-white shadow-sm flex-shrink-0">
            <Building2 size={16} />
          </div>
          <div>
            <p className="text-sm font-black leading-tight tracking-tight text-gray-950 dark:text-white" style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>Vyapaar Setu</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold tracking-wide leading-tight mt-0.5">v1.0.0</p>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-gray-600 dark:hover:text-white p-1">
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {(() => {
          const hasPermission = (item) => {
            if (!user) return false
            if (user.role === 'admin' || user.role === 'superadmin') return true

            const permissions = user.permissions || {}

            if (item.to === '/settings') {
              return !!permissions.can_manage_settings
            }
            if (item.to === '/products') {
              return !!permissions.can_view_products
            }
            if (item.to === '/sales/new') {
              return !!permissions.can_create_sales
            }
            if (item.to === '/sales') {
              return !!(permissions.can_view_sales || permissions.can_create_sales)
            }
            if (item.to === '/purchases/new') {
              return !!permissions.can_create_purchases
            }
            if (item.to === '/purchases') {
              return !!(permissions.can_view_purchases || permissions.can_create_purchases)
            }
            if (item.to === '/suppliers') {
              return !!(permissions.can_create_purchases || permissions.can_view_purchases)
            }
            if (item.to === '/customers') {
              return !!(permissions.can_create_sales || permissions.can_view_sales)
            }
            if (item.to === '/payments') {
              return !!(permissions.can_create_sales || permissions.can_view_sales || permissions.can_create_purchases || permissions.can_view_purchases)
            }
            if (item.to === '/inventory') {
              return !!permissions.can_view_products
            }
            if (item.to === '/reports') {
              return !!(permissions.can_view_sales || permissions.can_view_purchases)
            }
            return true
          }

          const filteredItems = []
          let currentDivider = null

          for (const item of NAV_ITEMS) {
            if (item.divider) {
              currentDivider = item
            } else {
              if (hasPermission(item)) {
                if (currentDivider) {
                  filteredItems.push(currentDivider)
                  currentDivider = null
                }
                filteredItems.push(item)
              }
            }
          }

          return filteredItems.map((item, idx) => {
            if (item.divider) return (
              <div key={idx} className="px-3 pt-4 pb-1">
                <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                  {item.label}
                </p>
              </div>
            )

            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/sales' || item.to === '/purchases'}
                onClick={onClose}
                className={({ isActive }) => `
                  relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] z-10 sidebar-link
                  ${isActive
                    ? 'text-gray-950 dark:text-white font-bold'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-950 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/5'
                  }
                `}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <>
                        <div className="active-nav-pill -z-10" />
                        <div className="active-nav-shadow -z-20 pointer-events-none" />
                      </>
                    )}
                    <Icon size={16} className="relative z-10" />
                    <span className="relative z-10">{item.label}</span>
                  </>
                )}
              </NavLink>
            )
          })
        })()}
      </nav>


      {/* User */}
      <div className="relative px-3 py-3 border-t border-gray-200/40 dark:border-white/5 bg-white/20 dark:bg-black/10 rounded-b-[20px]" ref={menuRef}>
        {/* Quick Actions Popover */}
        {menuOpen && (
          <div className="absolute bottom-full mb-2 left-3 right-3 p-2.5 bg-white/95 dark:bg-[#151b30]/95 border border-gray-200/40 dark:border-white/10 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.3)] backdrop-blur-xl animate-fade-in z-50 flex flex-col gap-1">
            <div className="px-2.5 py-1.5 border-b border-gray-150/40 dark:border-white/5 pb-2">
              <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{user?.full_name}</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wider mt-0.5">{user?.role}</p>
            </div>
            
            <button
              onClick={() => {
                navigate('/settings')
                setMenuOpen(false)
                onClose?.()
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 active:scale-[0.98] transition-all text-left"
            >
              <Settings size={14} className="text-gray-400 dark:text-gray-500" />
              <span>Settings & Profile</span>
            </button>

            <button
              onClick={toggle}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 active:scale-[0.98] transition-all text-left"
            >
              <span className="flex items-center gap-2.5">
                {dark ? (
                  <Sun size={14} className="text-amber-500" />
                ) : (
                  <Moon size={14} className="text-indigo-400" />
                )}
                <span>Toggle Theme</span>
              </span>
              <span className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-bold">
                {dark ? 'Dark' : 'Light'}
              </span>
            </button>

            <button
              onClick={() => {
                logout()
                setMenuOpen(false)
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-red-650 dark:text-red-400 hover:bg-red-500/10 active:scale-[0.98] transition-all text-left border-t border-gray-150/40 dark:border-white/5 pt-2 mt-1"
            >
              <LogOut size={14} />
              <span>Log Out</span>
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {/* 3D Liquid Glass Name Chip */}
          <button 
            onClick={() => setMenuOpen(!menuOpen)}
            className="user-glass-chip min-w-0 flex-1 hover:cursor-pointer text-left focus:outline-none"
            aria-label="User profile options"
          >
            <div className="user-glass-chip-avatar">
              {user?.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold truncate leading-tight tracking-wide text-indigo-700 dark:text-indigo-200">
                {user?.full_name}
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 leading-tight mt-0.5">
                {user?.role}
              </p>
            </div>
            <ChevronUp size={12} className={`text-gray-400 dark:text-gray-500 transition-transform duration-200 mr-0.5 ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={logout}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors duration-150 flex-shrink-0"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
