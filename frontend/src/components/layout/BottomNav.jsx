import { useState, useCallback, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { useCommandPalette } from '../../context/CommandPaletteContext'
import QuickCustomerModal from '../customers/QuickCustomerModal'
import {
  LayoutDashboard, TrendingUp, Warehouse, Package,
  Search, Sparkles, Plus, MoreHorizontal, X,
  Users, Truck, ShoppingBag, CreditCard,
  BarChart3, RotateCcw, Activity, FileText, Settings,
  ShoppingCart, Zap, Sun, Moon, LogOut, ChevronUp
} from 'lucide-react'

// ── Primary 5 tabs always in the capsule ────────────────────────────
const PRIMARY_TABS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/sales',     icon: TrendingUp,     label: 'Sales'     },
  { to: '/inventory', icon: Warehouse,       label: 'Inventory' },
  { to: '/products',  icon: Package,         label: 'Products'  },
]

// ── All other items – revealed in the "More" glass sheet ─────────────
const MORE_GROUPS = [
  {
    title: 'Sales & Customers',
    items: [
      { to: '/customers',  icon: Users,       label: 'Customers',    isCustomerRow: true },
      { to: '/payments',   icon: CreditCard,  label: 'Payments'      },
    ]
  },
  {
    title: 'Inventory & Supply',
    items: [
      { to: '/purchases',  icon: ShoppingBag, label: 'Purchases', quickTo: '/purchases/new' },
      { to: '/suppliers',  icon: Truck,       label: 'Suppliers'     },
    ]
  },
  {
    title: 'Operations',
    items: [
      { to: '/reports',       icon: BarChart3,  label: 'Reports'      },
      { to: '/returns',       icon: RotateCcw,  label: 'Returns'      },
      { to: '/traceability',  icon: Activity,   label: 'Traceability' },
      { to: '/documents',     icon: FileText,   label: 'Letterhead'   },
    ]
  },
  {
    title: 'Preferences',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
    ]
  },
]

// ── Permission helper (mirrors Sidebar logic) ─────────────────────────
function usePermission(user) {
  return useCallback((to) => {
    if (!user) return false
    if (user.role === 'admin' || user.role === 'superadmin') return true
    const p = user.permissions || {}
    if (to === '/settings')    return !!p.can_manage_settings
    if (to === '/products')    return !!p.can_view_products
    if (to === '/sales')       return !!(p.can_view_sales || p.can_create_sales)
    if (to === '/purchases')   return !!(p.can_view_purchases || p.can_create_purchases)
    if (to === '/suppliers')   return !!(p.can_create_purchases || p.can_view_purchases)
    if (to === '/customers')   return !!(p.can_create_sales || p.can_view_sales)
    if (to === '/payments')    return !!(p.can_create_sales || p.can_view_sales || p.can_create_purchases || p.can_view_purchases)
    if (to === '/inventory')   return !!p.can_view_products
    if (to === '/reports')     return !!(p.can_view_sales || p.can_view_purchases)
    if (to === '/returns')     return !!(p.can_create_sales || p.can_view_sales)
    if (to === '/traceability')return !!p.can_view_products
    if (to === '/documents')   return !!(p.can_create_sales || p.can_view_sales || p.can_manage_settings)
    return true
  }, [user])
}

export default function BottomNav({ visible = true }) {
  const location   = useLocation()
  const navigate   = useNavigate()
  const { user, logout } = useAuth()
  const { dark, toggle: toggleTheme } = useTheme()
  const { open: openSearch } = useCommandPalette()
  const hasPermission = usePermission(user)

  const [moreOpen, setMoreOpen]             = useState(false)
  const [customerModalOpen, setCMOpen]      = useState(false)
  const [searchQuery, setSearchQuery]       = useState('')
  const sheetRef = useRef(null)
  const searchInputRef = useRef(null)

  // Reset search when sheet closes
  useEffect(() => {
    if (!moreOpen) {
      setSearchQuery('')
    }
  }, [moreOpen])

  // Close sheet on outside click
  useEffect(() => {
    if (!moreOpen) return
    const handler = (e) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [moreOpen])

  // Close on route change
  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  // Escape key closes sheet
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setMoreOpen(false) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  // F2 quick sale shortcut
  useEffect(() => {
    const h = (e) => { if (e.key === 'F2') { e.preventDefault(); navigate('/sales/new') } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [navigate])

  // Filter groups based on search query inside the sheet
  const q = searchQuery.trim().toLowerCase()
  const filteredGroups = MORE_GROUPS.map((group) => {
    const visibleItems = group.items
      .filter((i) => hasPermission(i.to))
      .filter((i) => !q || i.label.toLowerCase().includes(q) || (i.isCustomerRow && 'khata'.includes(q)))
    return { ...group, items: visibleItems }
  }).filter((group) => group.items.length > 0)

  // Check if any more-item is active (to highlight the ••• tab)
  const moreRoutes = MORE_GROUPS.flatMap(g => g.items.map(i => i.to))
  const moreIsActive = moreRoutes.some(r =>
    location.pathname === r || (r !== '/dashboard' && location.pathname.startsWith(r + '/'))
  )

  const activeIndex = PRIMARY_TABS.findIndex(item =>
    location.pathname === item.to ||
    (item.to !== '/dashboard' && location.pathname.startsWith(item.to + '/'))
  )

  const go = (to) => { navigate(to); setMoreOpen(false) }

  return (
    <>
      {/* ── More sheet backdrop ────────────────────────────────────── */}
      {moreOpen && (
        <div
          className="bnav-sheet-backdrop"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── More glass sheet (slides up above the nav) ──────────────── */}
      <div
        ref={sheetRef}
        className={`bnav-sheet ${moreOpen ? 'bnav-sheet--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="All navigation"
      >
        {/* Sheet header */}
        <div className="bnav-sheet-header">
          <span className="bnav-sheet-title">All Sections</span>
          <button
            className="bnav-sheet-close"
            onClick={() => setMoreOpen(false)}
            aria-label="Close"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        {/* Global Search inside More sheet */}
        <div className="bnav-sheet-search-wrap">
          <div className="bnav-sheet-search-box">
            <Search size={15} strokeWidth={2.2} className="bnav-sheet-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sections or jump to… (Ctrl+K)"
              className="bnav-sheet-search-input"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="bnav-sheet-search-clear"
                aria-label="Clear search"
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setMoreOpen(false); openSearch(); }}
                className="bnav-sheet-cmd-pill"
                title="Open Global Search (Ctrl+K)"
              >
                <Sparkles size={9} strokeWidth={2.5} className="text-amber-400 dark:text-amber-300 mr-1" />
                <span>⌘K</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Sale prominent row */}
        <button
          className="bnav-quick-sale-row"
          onClick={() => go('/sales/new')}
        >
          <div className="bnav-qs-icon">
            <Plus size={14} strokeWidth={2.5} />
          </div>
          <span className="bnav-qs-label">Quick Sale</span>
          <kbd className="bnav-qs-kbd">F2</kbd>
        </button>

        {/* Navigation groups */}
        <div className="bnav-sheet-scroll">
          {filteredGroups.length === 0 ? (
            <div className="py-8 px-4 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                No sections found matching "{searchQuery}"
              </p>
              <button
                type="button"
                onClick={() => { setMoreOpen(false); openSearch(); }}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1.5 hover:underline"
              >
                <Sparkles size={11} /> Search all records with Global Search (Ctrl+K)
              </button>
            </div>
          ) : (
            filteredGroups.map((group) => {
              return (
                <div key={group.title} className="bnav-sheet-group">
                  <p className="bnav-sheet-group-title">{group.title}</p>
                  <div className="bnav-sheet-items">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const isActive = location.pathname === item.to ||
                        (item.to !== '/dashboard' && location.pathname.startsWith(item.to + '/'))
                      return (
                        <div key={item.to} className="bnav-sheet-item-row">
                          <button
                            className={`bnav-sheet-item ${isActive ? 'bnav-sheet-item--active' : ''}`}
                            onClick={() => go(item.to)}
                            aria-current={isActive ? 'page' : undefined}
                          >
                            <Icon size={15} strokeWidth={isActive ? 2.2 : 1.8} />
                            <span>{item.label}</span>
                          </button>

                          {/* Customers: Khata button */}
                          {item.isCustomerRow && (
                            <button
                              className="bnav-khata-btn"
                              onClick={() => { setCMOpen(true); setMoreOpen(false) }}
                              title="Quick Khata / Ledger"
                            >
                              <Zap size={9} /> Khata
                            </button>
                          )}

                          {/* Purchases/Sales: quick create */}
                          {item.quickTo && (
                            <button
                              className="bnav-quick-btn"
                              onClick={() => go(item.quickTo)}
                              title="Create new"
                            >
                              <Plus size={12} />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* User footer in sheet */}
        <div className="bnav-sheet-footer">
          <div className="bnav-sheet-user">
            <div className="bnav-avatar">
              {user?.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="bnav-user-info">
              <p className="bnav-user-name">{user?.full_name}</p>
              <p className="bnav-user-role">{user?.role}</p>
            </div>
          </div>
          <div className="bnav-sheet-footer-actions">
            <button className="bnav-footer-btn" onClick={toggleTheme} title="Toggle theme">
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button className="bnav-footer-btn bnav-footer-btn--danger" onClick={logout} title="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main floating bar ────────────────────────────────────────── */}
      <nav
        className={`bnav-wrapper no-print ${(!visible && !moreOpen) ? 'bnav-wrapper--hidden' : ''}`}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Main capsule */}
        <div className="bnav-capsule" role="tablist">
          {PRIMARY_TABS.map((item, idx) => {
            const Icon = item.icon
            const isActive = idx === activeIndex
            return (
              <button
                key={item.to}
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                tabIndex={0}
                className={`bnav-tab ${isActive ? 'bnav-tab--active' : ''}`}
                onClick={() => navigate(item.to)}
              >
                {isActive && <span className="bnav-active-pill" aria-hidden="true" />}
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.4 : 1.9}
                  className="bnav-tab-icon"
                  aria-hidden="true"
                />
                <span className="bnav-tab-label">{item.label}</span>
              </button>
            )
          })}

          {/* More ••• tab */}
          <button
            role="tab"
            aria-selected={moreIsActive || moreOpen}
            aria-label="More sections"
            tabIndex={0}
            className={`bnav-tab ${(moreIsActive || moreOpen) ? 'bnav-tab--active' : ''}`}
            onClick={() => setMoreOpen(o => !o)}
          >
            {(moreIsActive || moreOpen) && <span className="bnav-active-pill" aria-hidden="true" />}
            <MoreHorizontal
              size={20}
              strokeWidth={(moreIsActive || moreOpen) ? 2.4 : 1.9}
              className="bnav-tab-icon"
              aria-hidden="true"
            />
            <span className="bnav-tab-label">More</span>
          </button>
        </div>

        {/* Circular Quick Sale button */}
        <button
          className="bnav-sale-btn"
          onClick={() => navigate('/sales/new')}
          aria-label="Quick Sale (F2)"
          title="New Sale (F2)"
        >
          <Plus size={22} strokeWidth={2.3} aria-hidden="true" />
        </button>
      </nav>

      {/* Modals */}
      <QuickCustomerModal
        open={customerModalOpen}
        onClose={() => setCMOpen(false)}
      />
    </>
  )
}
