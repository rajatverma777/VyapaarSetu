import { useState, useRef, useEffect } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { FloatingUserMenu } from '../ui'
import { useCommandPalette } from '../../context/CommandPaletteContext'
import {
  LayoutDashboard, Package, Users, Truck, ShoppingCart,
  ShoppingBag, Warehouse, FileText, CreditCard,
  BarChart3, Settings, X, Building2, TrendingUp, LogOut,
  Sun, Moon, ChevronUp, RotateCcw, Activity,
  Search, ChevronRight, ChevronLeft, PanelLeftOpen, PanelLeftClose
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/sales/new',     icon: ShoppingCart,    label: 'New Sale' },
  { to: '/purchases/new', icon: ShoppingBag,     label: 'New Purchase' },
  { divider: true, label: 'MASTER' },
  { to: '/products',      icon: Package,         label: 'Products' },
  { to: '/customers',     icon: Users,           label: 'Customers' },
  { to: '/suppliers',     icon: Truck,           label: 'Suppliers' },
  { divider: true, label: 'TRANSACTIONS' },
  { to: '/sales',         icon: TrendingUp,      label: 'Sales' },
  { to: '/purchases',     icon: ShoppingBag,     label: 'Purchases' },
  { to: '/payments',      icon: CreditCard,      label: 'Payments' },
  { divider: true, label: 'MANAGEMENT' },
  { to: '/inventory',     icon: Warehouse,       label: 'Inventory' },
  { to: '/returns',       icon: RotateCcw,       label: 'Returns' },
  { to: '/traceability',  icon: Activity,        label: 'Traceability' },
  { to: '/reports',       icon: BarChart3,       label: 'Reports' },
  { to: '/settings',      icon: Settings,        label: 'Settings' },
  { divider: true, label: 'DOCUMENTS' },
  { to: '/documents',     icon: FileText,        label: 'Letterhead' },
]

export default function Sidebar({ onClose, mini, onToggleMini }) {
  const { user, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()
  const { open: openPalette } = useCommandPalette()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [menuAnchor, setMenuAnchor] = useState(null)
  const userButtonRef = useRef(null)

  const hasPermission = (item) => {
    if (!user) return false
    if (user.role === 'admin' || user.role === 'superadmin') return true
    const p = user.permissions || {}
    if (item.to === '/settings')        return !!p.can_manage_settings
    if (item.to === '/products')        return !!p.can_view_products
    if (item.to === '/sales/new')       return !!p.can_create_sales
    if (item.to === '/sales')           return !!(p.can_view_sales || p.can_create_sales)
    if (item.to === '/purchases/new')   return !!p.can_create_purchases
    if (item.to === '/purchases')       return !!(p.can_view_purchases || p.can_create_purchases)
    if (item.to === '/suppliers')       return !!(p.can_create_purchases || p.can_view_purchases)
    if (item.to === '/customers')       return !!(p.can_create_sales || p.can_view_sales)
    if (item.to === '/payments')        return !!(p.can_create_sales || p.can_view_sales || p.can_create_purchases || p.can_view_purchases)
    if (item.to === '/inventory')       return !!p.can_view_products
    if (item.to === '/reports')         return !!(p.can_view_sales || p.can_view_purchases)
    if (item.to === '/documents')       return !!(p.can_create_sales || p.can_view_sales || p.can_manage_settings)
    return true
  }

  const filteredItems = []
  let currentDivider = null
  for (const item of NAV_ITEMS) {
    if (item.divider) {
      currentDivider = item
    } else if (hasPermission(item)) {
      if (currentDivider) { filteredItems.push(currentDivider); currentDivider = null }
      filteredItems.push(item)
    }
  }

  const searchedItems = searchQuery.trim()
    ? filteredItems.filter(i => i.divider || i.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : filteredItems

  const handleUserClick = (e) => {
    e.stopPropagation()
    if (userButtonRef.current) {
      setMenuAnchor(userButtonRef.current.getBoundingClientRect())
      setMenuOpen(!menuOpen)
    }
  }

  // Safari-safe GPU animation:
  // 1. NO will-change inside backdrop-filter parent (WebKit bug: forces full BDF repaint per frame)
  // 2. Use `width` not `max-width` (Safari stutters on max-width: 0 → value boundaries)
  // 3. Animate only opacity + transform (compositor-only in ALL browsers including Safari)
  // 4. margin-left is NOT animated (layout-thread in Safari) — set instantly via width collapse
  const labelStyle = {
    display: 'inline-block',
    opacity: mini ? 0 : 1,
    transform: mini ? 'translateX(-4px) scaleX(0.7)' : 'translateX(0) scaleX(1)',
    transformOrigin: 'left center',
    width: mini ? '0px' : '150px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    // FIX: must be 0 in mini mode — even with width:0, a non-zero marginLeft
    // still occupies layout space inside the flex row, pushing the icon off-center.
    marginLeft: mini ? '0' : '10px',
    transition: mini
      ? 'opacity 110ms ease-out, transform 125ms ease-in, width 135ms ease-in'
      : 'opacity 135ms ease-out 40ms, transform 145ms ease-out 40ms, width 175ms ease-out',
    pointerEvents: mini ? 'none' : 'auto',
    WebkitTransform: mini ? 'translateX(-4px) scaleX(0.7) translateZ(0)' : 'translateX(0) scaleX(1) translateZ(0)',
    flexShrink: 0,
  }

  const profileTextStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
    minWidth: 0,
    opacity: mini ? 0 : 1,
    transform: mini ? 'translateX(-4px) translateZ(0)' : 'translateX(0) translateZ(0)',
    WebkitTransform: mini ? 'translateX(-4px) translateZ(0)' : 'translateX(0) translateZ(0)',
    width: mini ? '0px' : '160px',
    maxWidth: '160px',
    overflow: 'hidden',
    // FIX: same as labelStyle — must be 0 in mini mode to not push avatar off-center
    marginLeft: mini ? '0' : '8px',
    transition: mini
      ? 'opacity 110ms ease-out, transform 125ms ease-in, width 135ms ease-in'
      : 'opacity 135ms ease-out 40ms, transform 145ms ease-out 40ms, width 175ms ease-out',
    pointerEvents: mini ? 'none' : 'auto',
    flexShrink: 0,
  }

  return (
    <div className="card h-full flex flex-col backdrop-blur-2xl text-gray-900 dark:text-gray-100 overflow-hidden relative select-none">

      {/* ── HEADER — single always-mounted element, animates via CSS ─────────── */}
      <div className="flex items-center h-14 px-3 border-b border-gray-200/40 dark:border-white/5 flex-shrink-0 overflow-hidden">
        <button
          onClick={onToggleMini}
          disabled={!onToggleMini}
          className="flex items-center text-left gap-0 min-w-0 focus:outline-none border-none cursor-pointer bg-transparent p-0 text-inherit w-full group/toggle"
          title={mini ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {/* Icon slot: morphs between brand icon (full) and PanelLeftOpen (mini) */}
          <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center relative">
            {/* Brand icon — visible in full mode */}
            <div
              style={{
                opacity: mini ? 0 : 1,
                transform: mini ? 'scale(0.7) translateZ(0)' : 'scale(1) translateZ(0)',
                WebkitTransform: mini ? 'scale(0.7) translateZ(0)' : 'scale(1) translateZ(0)',
                transition: mini ? 'opacity 100ms ease-out, transform 110ms ease-in' : 'opacity 130ms ease-out 40ms, transform 130ms ease-out 40ms',
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              className="glass-icon-container rounded-xl"
            >
              <Building2 size={16} className="text-indigo-505" />
            </div>
            {/* PanelLeftOpen — visible in mini mode, with hover accent */}
            <div
              style={{
                opacity: mini ? 1 : 0,
                transform: mini ? 'scale(1) translateZ(0)' : 'scale(0.7) translateZ(0)',
                WebkitTransform: mini ? 'scale(1) translateZ(0)' : 'scale(0.7) translateZ(0)',
                transition: mini ? 'opacity 130ms ease-out 50ms, transform 130ms ease-out 50ms' : 'opacity 90ms ease-in, transform 90ms ease-in',
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '12px',
              }}
              className="hover:bg-indigo-500/10 dark:hover:bg-indigo-400/10 transition-colors duration-200"
            >
              <PanelLeftOpen size={16} className="text-indigo-500 dark:text-indigo-400" />
            </div>
          </div>
          {/* Brand text — always mounted.
              Safari fixes: no willChange (BDF repaint bug), width not max-width,
              no margin-left animation (layout thread), translateZ(0) for GPU layer */}
          <div
            style={{
              opacity: mini ? 0 : 1,
              transform: mini ? 'translateX(-6px) translateZ(0)' : 'translateX(0) translateZ(0)',
              WebkitTransform: mini ? 'translateX(-6px) translateZ(0)' : 'translateX(0) translateZ(0)',
              width: mini ? '0px' : '180px',
              overflow: 'hidden',
              marginLeft: mini ? '0px' : '12px',
              transition: mini
                ? 'opacity 110ms ease-out, transform 110ms ease-in, width 135ms ease-in'
                : 'opacity 135ms ease-out 40ms, transform 135ms ease-out 40ms, width 175ms ease-out',
              WebkitTransition: mini
                ? 'opacity 110ms ease-out, -webkit-transform 110ms ease-in, width 135ms ease-in'
                : 'opacity 135ms ease-out 40ms, -webkit-transform 135ms ease-out 40ms, width 175ms ease-out',
              pointerEvents: mini ? 'none' : 'auto',
              flexShrink: 0,
            }}
          >
            <div className="flex items-center gap-2">
              <p className="text-xs font-black leading-tight tracking-tight text-gray-950 dark:text-white whitespace-nowrap" style={{ fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>
                Vyapaar Setu
              </p>
              {/* Collapse hint icon next to brand name */}
              <PanelLeftClose
                size={12}
                className="text-gray-400 dark:text-gray-500 opacity-0 group-hover/toggle:opacity-100 transition-opacity duration-200 flex-shrink-0"
              />
            </div>
            <p className="text-[9px] text-gray-500 dark:text-gray-400 font-semibold tracking-wide leading-tight mt-0.5 whitespace-nowrap">
              v1.0.0 · Medical ERP
            </p>
          </div>
        </button>
      </div>

      {/* ── SEARCH AREA — single container, both states mounted and crossfading ─ */}
      {/* Safari fix: use height (not max-height) with explicit px values;
          max-height: 0 → auto/px stutters in Safari's layout engine */}
      <div className="flex-shrink-0 relative" style={{ height: '46px' }}>
        {/* Full search bar — shown in normal mode */}
        <div
          className="overflow-hidden"
          style={{
            opacity: mini ? 0 : 1,
            height: mini ? '0px' : '46px',
            transition: mini
              ? 'height 130ms ease-in, opacity 100ms ease-out'
              : 'height 175ms ease-out 25ms, opacity 130ms ease-out 50ms',
            WebkitTransition: mini
              ? 'height 130ms ease-in, opacity 100ms ease-out'
              : 'height 175ms ease-out 25ms, opacity 130ms ease-out 50ms',
            pointerEvents: mini ? 'none' : 'auto',
          }}
        >
          <div className="px-2 pt-2 pb-1">
            <div className="relative">
              <Search size={11} className="sidebar-search-icon" style={{ left: '12px' }} />
              <input
                className="sidebar-search-input"
                placeholder="Filter menu…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '28px', height: '28px', borderRadius: '8px' }}
              />
            </div>
          </div>
        </div>
        {/* Mini search icon button — shown in mini mode */}
        <div
          className="flex justify-center px-1.5 py-1 absolute inset-0"
          style={{
            opacity: mini ? 1 : 0,
            transform: mini ? 'scale(1) translateZ(0)' : 'scale(0.7) translateZ(0)',
            WebkitTransform: mini ? 'scale(1) translateZ(0)' : 'scale(0.7) translateZ(0)',
            transition: mini
              ? 'opacity 130ms ease-out 50ms, transform 130ms ease-out 50ms'
              : 'opacity 90ms ease-in, transform 90ms ease-in',
            WebkitTransition: mini
              ? 'opacity 130ms ease-out 50ms, -webkit-transform 130ms ease-out 50ms'
              : 'opacity 90ms ease-in, -webkit-transform 90ms ease-in',
            pointerEvents: mini ? 'auto' : 'none',
          }}
        >
          <button
            onClick={openPalette}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-550 hover:text-gray-955 dark:text-gray-400 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/5 transition-all cursor-pointer group relative"
            title="Search or jump to... (⌘K)"
          >
            <Search size={16} />
            <div className="absolute left-[calc(100%+14px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-slate-950/90 text-white border border-white/[0.08] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] text-[10px] font-bold tracking-wide whitespace-nowrap opacity-0 group-hover:opacity-100 group-hover:translate-x-1 translate-x-0 transition-all duration-200 pointer-events-none z-50">
              Quick Search (⌘K)
            </div>
          </button>
        </div>
      </div>

      {/* ── NAV ITEMS ──────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden sidebar-nav-container py-1.5 space-y-0.5 px-1.5">
        {searchedItems.map((item, idx) => {
          if (item.divider) {
            return (
              <div key={idx} className="px-2 pt-3 pb-1 overflow-hidden">
                <p
                  className="text-[8px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest whitespace-nowrap"
                  style={{
                    opacity: mini ? 0 : 1,
                    // height not max-height — Safari fix
                    height: mini ? '0px' : '14px',
                    overflow: 'hidden',
                    transition: mini
                      ? 'opacity 100ms ease-out, height 120ms ease-in'
                      : 'opacity 130ms ease-out 40ms, height 160ms ease-out',
                  }}
                >
                  {item.label}
                </p>
                <div
                  className="h-[1px] bg-gray-200/30 dark:bg-white/[0.04] w-full mt-0.5"
                  style={{
                    opacity: mini ? 1 : 0,
                    transition: mini
                      ? 'opacity 130ms ease-out 25ms'
                      : 'opacity 90ms ease-in',
                  }}
                />
              </div>
            )
          }

          const Icon = item.icon
          return (
            <div key={item.to} className="relative group flex justify-start w-full">
              {/* Safari fix: avoid class-switching that causes instant layout jump.
                  Use stable classes + inline style transitions for size/padding changes. */}
              <NavLink
                to={item.to}
                end={item.to === '/sales' || item.to === '/purchases'}
                onClick={onClose}
                style={{
                  width: mini ? '36px' : '100%',
                  padding: mini ? '0' : '6px 6px 6px 8px',
                  justifyContent: mini ? 'center' : 'flex-start',
                  margin: mini ? '0 auto' : '0',
                  transition: 'width 180ms ease-out, padding 180ms ease-out, margin 180ms ease-out',
                  WebkitTransition: 'width 180ms ease-out, padding 180ms ease-out, margin 180ms ease-out',
                }}
                className={({ isActive }) =>
                  `relative flex items-center rounded-xl transition-colors duration-200 active:scale-[0.98] group/link border h-9
                  ${isActive
                    // In mini mode: no spread shadow (16px blur bleeds into adjacent items
                    // since overflow-y:auto does not clip box-shadow vertically)
                    ? `text-indigo-650 dark:text-indigo-400 font-bold bg-indigo-500/10 dark:bg-indigo-500/15 border-indigo-500/15 dark:border-indigo-500/10${mini ? '' : ' shadow-[0_4px_16px_rgba(99,102,241,0.06)]'}`
                    : 'text-gray-650 dark:text-gray-400 hover:text-gray-955 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/5 border-transparent'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Left accent line — only shown in full mode (would look clipped in mini 36px) */}
                    {isActive && !mini && (
                      <span 
                        className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" 
                        style={{ animation: 'fade-in 200ms ease-out both' }}
                      />
                    )}
                    {/* Icon container */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-200
                      ${isActive 
                        ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shadow-inner' 
                        : 'bg-transparent text-gray-555 dark:text-gray-400 group-hover/link:bg-white/50 dark:group-hover/link:bg-white/5'
                      }`}
                    >
                      <Icon size={16} className="transition-transform duration-200 group-hover/link:scale-105" />
                    </div>
                    {/* Label — collapses via width+opacity (Safari-safe) */}
                    <span style={labelStyle} className="text-xs font-semibold truncate">
                      {item.label}
                    </span>
                    {/* Tooltip on hover in mini mode */}
                    {mini && (
                      <div className="absolute left-[calc(100%+14px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-slate-950/90 text-white border border-white/[0.08] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] text-[10px] font-bold tracking-wide whitespace-nowrap opacity-0 group-hover/link:opacity-100 group-hover/link:translate-x-1 translate-x-0 transition-all duration-200 pointer-events-none z-50">
                        {item.label}
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            </div>
          )
        })}

        {searchQuery && searchedItems.filter(i => !i.divider).length === 0 && (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-gray-400">No results for "{searchQuery}"</p>
          </div>
        )}
      </nav>

      {/* ── USER FOOTER ────────────────────────────────────────────────────── */}
      <div className="relative border-t border-gray-200/40 dark:border-white/5 bg-white/20 dark:bg-black/10 rounded-b-[20px] flex-shrink-0 px-2 py-2 overflow-hidden">
        <button
          ref={userButtonRef}
          onClick={handleUserClick}
          style={{
            // Instant switch — no animation on layout props (Safari safe)
            justifyContent: mini ? 'center' : 'flex-start',
            padding: mini ? '6px' : '6px 6px 6px 8px',
          }}
          className="w-full flex items-center rounded-xl transition-colors duration-200 hover:bg-white/40 dark:hover:bg-white/5 active:scale-[0.98] focus:outline-none text-left"
          aria-label="User profile options"
        >
          {/* Avatar — perfectly centered in mini mode by flexbox (no translate hack) */}
          <div
            className="w-7 h-7 rounded-full bg-indigo-500/10 dark:bg-indigo-300/15 text-indigo-650 dark:text-indigo-400 border border-indigo-500/20 dark:border-indigo-300/25 flex-shrink-0 flex items-center justify-center font-bold text-[10px] shadow-sm"
          >
            {user?.full_name?.[0]?.toUpperCase() || 'U'}
          </div>
          
          <div 
            style={profileTextStyle}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold truncate leading-tight tracking-wide text-indigo-700 dark:text-indigo-200">
                {user?.full_name}
              </p>
              <p className="text-[8px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 leading-tight mt-0.5">
                {user?.role}
              </p>
            </div>
            <ChevronUp size={11} className="text-gray-400 flex-shrink-0 mr-1" />
          </div>
        </button>
      </div>

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
