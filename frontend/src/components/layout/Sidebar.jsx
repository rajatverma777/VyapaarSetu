import { useState, useRef, useEffect } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { FloatingUserMenu } from '../ui'
import { useCommandPalette } from '../../context/CommandPaletteContext'
import QuickCustomerModal from '../customers/QuickCustomerModal'
import {
  LayoutDashboard, Package, Users, Truck, ShoppingCart,
  ShoppingBag, Warehouse, FileText, CreditCard,
  BarChart3, Settings, X, Building2, TrendingUp, LogOut,
  Sun, Moon, ChevronUp, RotateCcw, Activity,
  Search, ChevronRight, ChevronLeft, PanelLeftOpen, PanelLeftClose,
  Plus, Zap, ArrowRight, UserPlus
} from 'lucide-react'

// Apple-style semantic navigation groups
const NAV_GROUPS = [
  {
    title: 'CORE',
    items: [
      {
        to: '/dashboard',
        icon: LayoutDashboard,
        label: 'Dashboard',
        color: '#0071e3',
        tint: 'rgba(0, 113, 227, 0.12)',
        darkTint: 'rgba(10, 132, 255, 0.18)',
        textColor: '#0071e3',
        darkTextColor: '#0a84ff',
      },
    ]
  },
  {
    title: 'SALES & CUSTOMERS',
    items: [
      {
        to: '/sales',
        icon: TrendingUp,
        label: 'Sales & Bills',
        color: '#34c759',
        tint: 'rgba(52, 199, 89, 0.12)',
        darkTint: 'rgba(48, 209, 88, 0.18)',
        textColor: '#248a3d',
        darkTextColor: '#30d158',
        quickTo: '/sales/new',
        quickLabel: 'New Sale',
        quickTitle: 'Create new sale bill (F2)'
      },
      {
        to: '/customers',
        icon: Users,
        label: 'Customers',
        color: '#5856d6',
        tint: 'rgba(88, 86, 214, 0.12)',
        darkTint: 'rgba(125, 122, 255, 0.18)',
        textColor: '#5856d6',
        darkTextColor: '#7d7aff',
        isCustomerRow: true,
      },
      {
        to: '/payments',
        icon: CreditCard,
        label: 'Payments',
        color: '#30b0c7',
        tint: 'rgba(48, 176, 199, 0.12)',
        darkTint: 'rgba(102, 212, 207, 0.18)',
        textColor: '#0284c7',
        darkTextColor: '#66d4cf',
      },
    ]
  },
  {
    title: 'INVENTORY & SUPPLY',
    items: [
      {
        to: '/products',
        icon: Package,
        label: 'Products',
        color: '#ff9500',
        tint: 'rgba(255, 149, 0, 0.12)',
        darkTint: 'rgba(255, 159, 10, 0.18)',
        textColor: '#d97706',
        darkTextColor: '#ff9f0a',
      },
      {
        to: '/inventory',
        icon: Warehouse,
        label: 'Stock / Batches',
        color: '#ff9f0a',
        tint: 'rgba(255, 159, 10, 0.12)',
        darkTint: 'rgba(255, 179, 64, 0.18)',
        textColor: '#ea580c',
        darkTextColor: '#fb923c',
      },
      {
        to: '/purchases',
        icon: ShoppingBag,
        label: 'Purchases',
        color: '#af52de',
        tint: 'rgba(175, 82, 222, 0.12)',
        darkTint: 'rgba(191, 90, 242, 0.18)',
        textColor: '#9333ea',
        darkTextColor: '#c084fc',
        quickTo: '/purchases/new',
        quickLabel: 'New Purchase',
        quickTitle: 'Record new purchase bill'
      },
      {
        to: '/suppliers',
        icon: Truck,
        label: 'Suppliers',
        color: '#0071e3',
        tint: 'rgba(0, 113, 227, 0.10)',
        darkTint: 'rgba(10, 132, 255, 0.16)',
        textColor: '#0071e3',
        darkTextColor: '#0a84ff',
      },
    ]
  },
  {
    title: 'OPERATIONS',
    items: [
      {
        to: '/reports',
        icon: BarChart3,
        label: 'Reports',
        color: '#ff2d55',
        tint: 'rgba(255, 45, 85, 0.12)',
        darkTint: 'rgba(255, 55, 95, 0.18)',
        textColor: '#e11d48',
        darkTextColor: '#fb7185',
      },
      {
        to: '/returns',
        icon: RotateCcw,
        label: 'Returns',
        color: '#f97316',
        tint: 'rgba(249, 115, 22, 0.12)',
        darkTint: 'rgba(251, 146, 60, 0.18)',
        textColor: '#ea580c',
        darkTextColor: '#fb923c',
      },
      {
        to: '/traceability',
        icon: Activity,
        label: 'Traceability',
        color: '#06b6d4',
        tint: 'rgba(6, 182, 212, 0.12)',
        darkTint: 'rgba(34, 211, 238, 0.18)',
        textColor: '#0891b2',
        darkTextColor: '#22d3ee',
      },
      {
        to: '/documents',
        icon: FileText,
        label: 'Letterhead',
        color: '#8b5cf6',
        tint: 'rgba(139, 92, 246, 0.12)',
        darkTint: 'rgba(167, 139, 250, 0.18)',
        textColor: '#7c3aed',
        darkTextColor: '#a78bfa',
      },
    ]
  },
  {
    title: 'PREFERENCES',
    items: [
      {
        to: '/settings',
        icon: Settings,
        label: 'Settings',
        color: '#64748b',
        tint: 'rgba(100, 116, 139, 0.12)',
        darkTint: 'rgba(148, 163, 184, 0.18)',
        textColor: '#475569',
        darkTextColor: '#94a3b8',
      },
    ]
  },
]

export default function Sidebar({ onClose, mini, onToggleMini }) {
  const { user, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const { open: openPalette } = useCommandPalette()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [menuAnchor, setMenuAnchor] = useState(null)
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const userButtonRef = useRef(null)

  // Global F2 keyboard shortcut for Quick Sale
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F2') {
        e.preventDefault()
        navigate('/sales/new')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  const hasPermission = (item) => {
    if (!user) return false
    if (user.role === 'admin' || user.role === 'superadmin') return true
    const p = user.permissions || {}
    if (item.to === '/settings')     return !!p.can_manage_settings
    if (item.to === '/products')     return !!p.can_view_products
    if (item.to === '/sales')        return !!(p.can_view_sales || p.can_create_sales)
    if (item.to === '/purchases')    return !!(p.can_view_purchases || p.can_create_purchases)
    if (item.to === '/suppliers')    return !!(p.can_create_purchases || p.can_view_purchases)
    if (item.to === '/customers')    return !!(p.can_create_sales || p.can_view_sales)
    if (item.to === '/payments')     return !!(p.can_create_sales || p.can_view_sales || p.can_create_purchases || p.can_view_purchases)
    if (item.to === '/inventory')    return !!p.can_view_products
    if (item.to === '/reports')      return !!(p.can_view_sales || p.can_view_purchases)
    if (item.to === '/returns')      return !!(p.can_create_sales || p.can_view_sales)
    if (item.to === '/traceability') return !!p.can_view_products
    if (item.to === '/documents')    return !!(p.can_create_sales || p.can_view_sales || p.can_manage_settings)
    return true
  }

  // Filter groups and items
  const q = searchQuery.trim().toLowerCase()
  const visibleGroups = NAV_GROUPS.map(g => ({
    title: g.title,
    items: g.items.filter(item => {
      if (!hasPermission(item)) return false
      if (!q) return true
      return item.label.toLowerCase().includes(q)
    })
  })).filter(g => g.items.length > 0)

  const handleUserClick = (e) => {
    e.stopPropagation()
    if (userButtonRef.current) {
      setMenuAnchor(userButtonRef.current.getBoundingClientRect())
      setMenuOpen(!menuOpen)
    }
  }

  // Safari-safe GPU animation styles:
  const labelStyle = {
    display: 'inline-block',
    opacity: mini ? 0 : 1,
    transform: mini ? 'translateX(-4px) scaleX(0.7)' : 'translateX(0) scaleX(1)',
    transformOrigin: 'left center',
    width: mini ? '0px' : '110px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    marginLeft: mini ? '0' : '8px',
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
    marginLeft: mini ? '0' : '8px',
    transition: mini
      ? 'opacity 110ms ease-out, transform 125ms ease-in, width 135ms ease-in'
      : 'opacity 135ms ease-out 40ms, transform 145ms ease-out 40ms, width 175ms ease-out',
    pointerEvents: mini ? 'none' : 'auto',
    flexShrink: 0,
  }

  return (
    <div className="card h-full flex flex-col backdrop-blur-2xl text-gray-900 dark:text-gray-100 overflow-hidden relative select-none">

      {/* ── HEADER — single always-mounted element ─────────────────────────── */}
      <div className="flex items-center h-14 px-3 border-b border-gray-200/40 dark:border-white/5 flex-shrink-0 overflow-hidden">
        <button
          onClick={onToggleMini}
          disabled={!onToggleMini}
          className="flex items-center text-left gap-0 min-w-0 focus:outline-none border-none cursor-pointer bg-transparent p-0 text-inherit w-full group/toggle"
          title={mini ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {/* Brand slot */}
          <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center relative">
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
              <Building2 size={16} className="text-indigo-500" />
            </div>
            {/* PanelLeftOpen */}
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
              pointerEvents: mini ? 'none' : 'auto',
              flexShrink: 0,
            }}
          >
            <div className="flex items-center gap-2">
              <p className="text-xs font-black leading-tight tracking-tight text-gray-950 dark:text-white whitespace-nowrap" style={{ fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>
                Vyapaar Setu
              </p>
              <PanelLeftClose
                size={12}
                className="text-gray-400 dark:text-gray-500 opacity-0 group-hover/toggle:opacity-100 transition-opacity duration-200 flex-shrink-0"
              />
            </div>
            <p className="text-[9px] text-gray-500 dark:text-gray-400 font-semibold tracking-wide leading-tight mt-0.5 whitespace-nowrap">
              Medical Wholesale ERP
            </p>
          </div>
        </button>
      </div>

      {/* ── TOP PRIMARY ACTION: QUICK SALE BUTTON ─────────────────────────── */}
      <div className="px-2 pt-2.5 pb-1 flex-shrink-0">
        {!mini ? (
          <button
            type="button"
            onClick={() => navigate('/sales/new')}
            className="sidebar-action-btn w-full flex items-center justify-between py-2 px-3 rounded-xl font-bold text-xs shadow-md cursor-pointer group select-none"
            title="Create New Sale Bill (Shortcut: F2)"
          >
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-lg bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus size={13} strokeWidth={2.6} />
              </div>
              <span className="tracking-tight text-white font-bold text-[12px]">Quick Sale</span>
            </div>
            <kbd className="text-[9px] bg-black/25 text-white/90 px-1.5 py-0.5 rounded-md font-mono font-bold tracking-wider">
              F2
            </kbd>
          </button>
        ) : (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => navigate('/sales/new')}
              className="sidebar-action-btn w-9 h-9 rounded-xl flex items-center justify-center font-bold shadow-md cursor-pointer group relative"
              title="Quick Sale / Bill (F2)"
            >
              <Plus size={16} strokeWidth={2.6} />
              <div className="absolute left-[calc(100%+14px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-slate-950/90 text-white border border-white/[0.08] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] text-[10px] font-bold tracking-wide whitespace-nowrap opacity-0 group-hover:opacity-100 group-hover:translate-x-1 translate-x-0 transition-all duration-200 pointer-events-none z-50">
                Quick Sale (F2)
              </div>
            </button>
          </div>
        )}
      </div>

      {/* ── SEARCH AREA ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 relative" style={{ height: '40px' }}>
        <div
          className="overflow-hidden"
          style={{
            opacity: mini ? 0 : 1,
            height: mini ? '0px' : '40px',
            transition: mini
              ? 'height 130ms ease-in, opacity 100ms ease-out'
              : 'height 175ms ease-out 25ms, opacity 130ms ease-out 50ms',
            pointerEvents: mini ? 'none' : 'auto',
          }}
        >
          <div className="px-2 pt-1 pb-1">
            <div className="relative">
              <Search size={11} className="sidebar-search-icon" style={{ left: '10px' }} />
              <input
                className="sidebar-search-input"
                placeholder="Filter menu…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '26px', height: '26px', borderRadius: '8px', fontSize: '11px' }}
              />
            </div>
          </div>
        </div>

        {/* Mini Search Icon */}
        <div
          className="flex justify-center px-1.5 py-0.5 absolute inset-0"
          style={{
            opacity: mini ? 1 : 0,
            transform: mini ? 'scale(1) translateZ(0)' : 'scale(0.7) translateZ(0)',
            transition: mini
              ? 'opacity 130ms ease-out 50ms, transform 130ms ease-out 50ms'
              : 'opacity 90ms ease-in, transform 90ms ease-in',
            pointerEvents: mini ? 'auto' : 'none',
          }}
        >
          <button
            onClick={openPalette}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/5 transition-all cursor-pointer group relative"
            title="Search or jump to... (⌘K)"
          >
            <Search size={15} />
            <div className="absolute left-[calc(100%+14px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-slate-950/90 text-white border border-white/[0.08] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] text-[10px] font-bold tracking-wide whitespace-nowrap opacity-0 group-hover:opacity-100 group-hover:translate-x-1 translate-x-0 transition-all duration-200 pointer-events-none z-50">
              Search (⌘K)
            </div>
          </button>
        </div>
      </div>

      {/* ── NAV GROUPS & ITEMS ────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden sidebar-nav-container py-1 space-y-3 px-1.5">
        {visibleGroups.map((group, gIdx) => (
          <div key={gIdx} className="space-y-0.5">
            {/* Section Title */}
            {!mini && (
              <div className="px-2 pt-1.5 pb-1 flex items-center justify-between">
                <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {group.title}
                </span>
              </div>
            )}

            {group.items.map((item) => {
              const Icon = item.icon
              const isSalePage = item.to === '/sales'
              const isPurchasePage = item.to === '/purchases'
              const isCustomerPage = item.to === '/customers'
              const isActive = location.pathname === item.to || (item.to !== '/dashboard' && location.pathname.startsWith(item.to + '/'))

              return (
                <div key={item.to} className="relative group flex items-center justify-start w-full">
                  <NavLink
                    to={item.to}
                    end={item.to === '/sales' || item.to === '/purchases'}
                    onClick={onClose}
                    style={{
                      width: mini ? '36px' : '100%',
                      padding: mini ? '0' : '4px 6px 4px 6px',
                      justifyContent: mini ? 'center' : 'flex-start',
                      margin: mini ? '0 auto' : '0',
                      transition: 'width 180ms ease-out, padding 180ms ease-out',
                    }}
                    className={({ isActive: linkActive }) =>
                      `relative flex items-center rounded-xl transition-all duration-150 active:scale-[0.98] border h-9 group/link
                      ${linkActive
                        ? 'sidebar-nav-active'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-950 dark:hover:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.04] border-transparent'
                      }`
                    }
                  >
                    {({ isActive: linkActive }) => (
                      <>
                        {/* Active Left Indicator Bar (Full mode) */}
                        {!mini && linkActive && (
                          <span
                            className="w-1 h-3.5 rounded-full shrink-0 mr-1.5"
                            style={{ backgroundColor: item.color }}
                          />
                        )}

                        {/* SF-Style Translucent Icon Badge */}
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-150 group-hover/link:scale-105"
                          style={{
                            backgroundColor: dark ? item.darkTint : item.tint,
                            color: dark ? item.darkTextColor : item.textColor,
                            border: `1px solid ${dark ? item.darkTint : item.tint}`,
                          }}
                        >
                          <Icon size={15} strokeWidth={2} />
                        </div>

                        {/* Label */}
                        <span
                          style={labelStyle}
                          className={`text-xs tracking-tight truncate ${
                            linkActive ? 'font-bold' : 'font-medium'
                          }`}
                        >
                          {item.label}
                        </span>

                        {/* Customer Row: Quick Khata Button */}
                        {!mini && item.isCustomerRow && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setCustomerModalOpen(true)
                            }}
                            className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#5856d6]/10 text-[#5856d6] dark:text-[#7d7aff] hover:bg-[#5856d6] hover:text-white dark:hover:bg-[#5856d6] dark:hover:text-white border border-[#5856d6]/20 transition-all opacity-90 group-hover/link:opacity-100 flex items-center gap-0.5"
                            title="Quick Khata, Ledger & Dues Search"
                          >
                            <Zap size={10} /> Khata
                          </button>
                        )}

                        {/* Sales / Purchases: Inline '+' Quick Button */}
                        {!mini && item.quickTo && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              navigate(item.quickTo)
                            }}
                            className="ml-auto w-5 h-5 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.10] opacity-0 group-hover/link:opacity-100 transition-all"
                            title={item.quickTitle}
                          >
                            <Plus size={13} strokeWidth={2.4} />
                          </button>
                        )}

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
          </div>
        ))}

        {searchQuery && visibleGroups.length === 0 && (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-gray-400">No results for "{searchQuery}"</p>
          </div>
        )}
      </nav>

      {/* ── USER FOOTER ───────────────────────────────────────────────────── */}
      <div className="relative border-t border-gray-200/40 dark:border-white/5 bg-white/20 dark:bg-black/10 rounded-b-[20px] flex-shrink-0 px-2 py-2 overflow-hidden">
        <button
          ref={userButtonRef}
          onClick={handleUserClick}
          style={{
            justifyContent: mini ? 'center' : 'flex-start',
            padding: mini ? '6px' : '6px 6px 6px 8px',
          }}
          className="w-full flex items-center rounded-xl transition-colors duration-200 hover:bg-white/40 dark:hover:bg-white/5 active:scale-[0.98] focus:outline-none text-left"
          aria-label="User profile options"
        >
          {/* Avatar */}
          <div
            className="w-7 h-7 rounded-full bg-black/[0.05] dark:bg-white/[0.10] text-gray-800 dark:text-gray-200 border border-black/[0.06] dark:border-white/[0.12] flex-shrink-0 flex items-center justify-center font-bold text-[10px]"
          >
            {user?.full_name?.[0]?.toUpperCase() || 'U'}
          </div>
          
          <div style={profileTextStyle}>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold truncate leading-tight tracking-tight text-gray-900 dark:text-white">
                {user?.full_name}
              </p>
              <p className="text-[8.5px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 leading-tight mt-0.5">
                {user?.role}
              </p>
            </div>
            <ChevronUp size={11} className="text-gray-400 dark:text-gray-500 flex-shrink-0 mr-1" />
          </div>
        </button>
      </div>

      {/* Floating User Menu */}
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

      {/* Customer Hub & Khata Modal */}
      <QuickCustomerModal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
      />
    </div>
  )
}
