import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useCommandPalette } from '../../context/CommandPaletteContext'
import {
  Search, LayoutDashboard, ShoppingCart, ShoppingBag, Package,
  Users, Truck, TrendingUp, CreditCard, Warehouse, RotateCcw,
  BarChart3, Settings, FileText, Activity, X, ArrowRight, Hash
} from 'lucide-react'

const NAV_PAGES = [
  { label: 'Dashboard',    to: '/dashboard',      icon: LayoutDashboard, shortcut: null },
  { label: 'New Sale',     to: '/sales/new',       icon: ShoppingCart,    shortcut: 'N S' },
  { label: 'New Purchase', to: '/purchases/new',   icon: ShoppingBag,     shortcut: 'N P' },
  { label: 'Products',     to: '/products',        icon: Package,         shortcut: null },
  { label: 'Customers',    to: '/customers',       icon: Users,           shortcut: null },
  { label: 'Suppliers',    to: '/suppliers',       icon: Truck,           shortcut: null },
  { label: 'Sales',        to: '/sales',           icon: TrendingUp,      shortcut: null },
  { label: 'Purchases',    to: '/purchases',       icon: ShoppingBag,     shortcut: null },
  { label: 'Payments',     to: '/payments',        icon: CreditCard,      shortcut: null },
  { label: 'Inventory',    to: '/inventory',       icon: Warehouse,       shortcut: null },
  { label: 'Returns',      to: '/returns',         icon: RotateCcw,       shortcut: null },
  { label: 'Traceability', to: '/traceability',    icon: Activity,        shortcut: null },
  { label: 'Reports',      to: '/reports',         icon: BarChart3,       shortcut: null },
  { label: 'Settings',     to: '/settings',        icon: Settings,        shortcut: null },
  { label: 'Letterhead',   to: '/documents',       icon: FileText,        shortcut: null },
]

export default function CommandPalette() {
  const { isOpen, close } = useCommandPalette()
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(0)

  // Filter pages by query
  const filtered = query.trim()
    ? NAV_PAGES.filter(p => p.label.toLowerCase().includes(query.toLowerCase()))
    : NAV_PAGES

  // Reset on open/close
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setFocusedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Keyboard navigation
  const handleKey = useCallback((e) => {
    if (!isOpen) return
    if (e.key === 'Escape') { close(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[focusedIdx]
      if (item) { navigate(item.to); close() }
    }
  }, [isOpen, close, filtered, focusedIdx, navigate])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (!isOpen) return null

  return createPortal(
    <div className="cmd-overlay" onClick={close}>
      <div className="cmd-box" onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div className="cmd-input-wrap">
          <Search size={17} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Search pages, actions…"
            value={query}
            onChange={e => { setQuery(e.target.value); setFocusedIdx(0) }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X size={14} />
            </button>
          )}
          <kbd className="cmd-item-shortcut">ESC</kbd>
        </div>

        {/* Results */}
        <div className="cmd-results">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-2">
              <Hash size={28} className="text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">No results for "{query}"</p>
            </div>
          ) : (
            <>
              <p className="cmd-group-label">Pages</p>
              {filtered.map((item, idx) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.to}
                    className={`cmd-item w-full text-left ${idx === focusedIdx ? 'cmd-focused' : ''}`}
                    onClick={() => { navigate(item.to); close() }}
                    onMouseEnter={() => setFocusedIdx(idx)}
                  >
                    <span className="cmd-item-icon">
                      <Icon size={15} />
                    </span>
                    <span className="cmd-item-label">{item.label}</span>
                    {item.shortcut && (
                      <span className="cmd-item-shortcut">{item.shortcut}</span>
                    )}
                    <ArrowRight size={13} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                  </button>
                )
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="cmd-footer">
          <span className="flex items-center gap-1.5">
            <kbd>↑</kbd><kbd>↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd>↵</kbd> open
          </span>
          <span className="flex items-center gap-1.5 ml-auto">
            <kbd>⌘K</kbd> toggle
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}
