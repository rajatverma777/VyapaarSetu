import { useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, TrendingUp, Warehouse, Search, Sparkles } from 'lucide-react'
import { useCommandPalette } from '../../context/CommandPaletteContext'

// The three high-frequency nav tabs — matches the Apple Photos layout exactly
const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/sales',     icon: TrendingUp,     label: 'Billing'   },
  { to: '/inventory', icon: Warehouse,       label: 'Inventory' },
]

export default function BottomNav() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { open: openSearch } = useCommandPalette()

  // Determine active tab (prefix match so /sales/new also activates Sales)
  const activeIndex = NAV_ITEMS.findIndex(item =>
    location.pathname === item.to ||
    (item.to !== '/dashboard' && location.pathname.startsWith(item.to))
  )

  return (
    <nav
      className="bottom-nav-wrapper no-print"
      role="navigation"
      aria-label="Main navigation"
    >
      {/* ── Main capsule ──────────────────────────────────────────── */}
      <div className="bottom-nav-capsule" role="tablist">
        {NAV_ITEMS.map((item, idx) => {
          const Icon    = item.icon
          const isActive = idx === activeIndex
          return (
            <button
              key={item.to}
              role="tab"
              aria-selected={isActive}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              tabIndex={0}
              className={`bottom-nav-item ${isActive ? 'bottom-nav-item--active' : ''}`}
              onClick={() => navigate(item.to)}
            >
              {/* Blue-tinted active pill */}
              {isActive && <span className="bottom-nav-active-pill" aria-hidden="true" />}

              <Icon
                size={22}
                strokeWidth={isActive ? 2.4 : 1.9}
                className="bottom-nav-icon"
                aria-hidden="true"
              />
              <span className="bottom-nav-label">{item.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Separate circular Search button ───────────────────────── */}
      <button
        className="bottom-nav-search-btn"
        onClick={openSearch}
        aria-label="Open global search (Ctrl+K)"
        title="Search (Ctrl+K)"
      >
        {/* Sparkle accent above the search icon — matches the screenshot */}
        <Sparkles
          size={9}
          strokeWidth={2.5}
          className="bottom-nav-sparkle"
          aria-hidden="true"
        />
        <Search size={20} strokeWidth={2} aria-hidden="true" />
      </button>
    </nav>
  )
}
