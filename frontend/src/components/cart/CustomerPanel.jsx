import { useState, useCallback, useRef, useEffect, memo } from 'react'
import {
  User, X, Phone, CreditCard, AlertTriangle,
  Edit3, Clock, BookOpen, Wallet, MessageCircle, Star,
  Search, Activity,
  Tag, CheckCircle2, AlertCircle,
  UserPlus, Users, Heart, History, Save, RefreshCw
} from 'lucide-react'
import { customerAPI, salesAPI } from '../../services/api'
import { Modal, Spinner } from '../ui'
import { useCart } from './CartContext'
import { INDIAN_STATES } from '../../services/constants'

// ── Date formatter ─────────────────────────────────────────────────────────────
const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) } catch { return d } }

// ── Utility helpers ────────────────────────────────────────────────────────────
const fmt = (n) => (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
const fmtCurrency = (n) => `₹${fmt(n)}`
const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (name.slice(0, 2)).toUpperCase()
}
const daysSince = (dateStr) => {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

// ── Avatar gradient palettes (deterministic from name) ─────────────────────────
const AVATAR_GRADIENTS = [
  ['#6366f1', '#8b5cf6'],
  ['#3b82f6', '#6366f1'],
  ['#10b981', '#059669'],
  ['#f59e0b', '#ef4444'],
  ['#ec4899', '#8b5cf6'],
  ['#14b8a6', '#3b82f6'],
  ['#f97316', '#ef4444'],
  ['#8b5cf6', '#ec4899'],
]
const getGradient = (name = '') => {
  const idx = name.charCodeAt(0) % AVATAR_GRADIENTS.length
  return AVATAR_GRADIENTS[idx]
}

// ── Customer type badge config ─────────────────────────────────────────────────
const TYPE_BADGE = {
  retail:      { label: 'Retail',      bg: '#dbeafe', text: '#1d4ed8', dark: 'rgba(59,130,246,0.20)', darkText: '#93c5fd' },
  wholesale:   { label: 'Wholesale',   bg: '#ede9fe', text: '#6d28d9', dark: 'rgba(139,92,246,0.20)', darkText: '#c4b5fd' },
  distributor: { label: 'Distributor', bg: '#ffedd5', text: '#c2410c', dark: 'rgba(249,115,22,0.20)', darkText: '#fdba74' },
  hospital:    { label: 'Hospital',    bg: '#dcfce7', text: '#15803d', dark: 'rgba(34,197,94,0.20)',  darkText: '#86efac' },
  vip:         { label: 'VIP',         bg: '#fef9c3', text: '#a16207', dark: 'rgba(234,179,8,0.20)', darkText: '#fde047' },
}

// ── Health Score ───────────────────────────────────────────────────────────────
function getHealthScore(customer, creditExceeded) {
  const balance = customer?.current_balance || 0
  const limit   = customer?.credit_limit    || 0
  if (creditExceeded) return { label: 'At Risk', color: '#ef4444', icon: AlertCircle, bg: 'rgba(239,68,68,0.08)' }
  if (limit > 0 && balance > limit * 0.7) return { label: 'Good', color: '#f59e0b', icon: Activity, bg: 'rgba(245,158,11,0.08)' }
  return { label: 'Excellent', color: '#10b981', icon: CheckCircle2, bg: 'rgba(16,185,129,0.08)' }
}

// ── Avatar Component ───────────────────────────────────────────────────────────
const CustomerAvatar = memo(({ name, size = 48, animate = false }) => {
  const [g1, g2] = getGradient(name)
  return (
    <div
      className={`cpc-avatar flex-shrink-0 flex items-center justify-center rounded-2xl text-white font-bold select-none ${animate ? 'cpc-avatar-enter' : ''}`}
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, ${g1} 0%, ${g2} 100%)`,
        boxShadow: `0 4px 16px ${g1}55, 0 1px 0 rgba(255,255,255,0.3) inset`,
        fontSize: size * 0.34,
        letterSpacing: '-0.02em',
      }}
    >
      {getInitials(name)}
    </div>
  )
})
CustomerAvatar.displayName = 'CustomerAvatar'

// ── TypeBadge ──────────────────────────────────────────────────────────────────
const TypeBadge = memo(({ type }) => {
  const cfg = TYPE_BADGE[type?.toLowerCase()] || TYPE_BADGE.retail
  return (
    <span
      className="cpc-type-badge"
      style={{ '--badge-bg': cfg.bg, '--badge-text': cfg.text, '--badge-dark-bg': cfg.dark, '--badge-dark-text': cfg.darkText }}
    >
      {cfg.label}
    </span>
  )
})
TypeBadge.displayName = 'TypeBadge'

// ── Stat Chip ──────────────────────────────────────────────────────────────────
const StatChip = memo(({ label, value, sub, accent }) => (
  <div className="cpc-stat-chip" style={{ '--accent': accent || '#6366f1' }}>
    <p className="cpc-stat-label">{label}</p>
    <p className="cpc-stat-value" style={{ color: accent }}>{value}</p>
    {sub && <p className="cpc-stat-sub">{sub}</p>}
  </div>
))
StatChip.displayName = 'StatChip'

// ── Action Button ──────────────────────────────────────────────────────────────
const ActionBtn = memo(({ icon: Icon, label, onClick, accent, danger }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    className="cpc-action-btn"
    style={{ '--ab-accent': danger ? '#ef4444' : (accent || '#6366f1') }}
  >
    <Icon size={14} />
    <span>{label}</span>
  </button>
))
ActionBtn.displayName = 'ActionBtn'

// ── Financial Status Widget ─────────────────────────────────────────────────────
const FinancialWidget = memo(({ outstanding, creditLimit, creditExceeded, cartTotal }) => {
  const isClean    = outstanding <= 0
  const isOverdue  = creditExceeded
  const isPartial  = !isClean && !isOverdue

  const status = isClean ? {
    label: '✓ No Due',
    color: '#10b981',
    bg:    'rgba(16,185,129,0.06)',
    border:'rgba(16,185,129,0.20)',
    dot:   '#10b981',
  } : isOverdue ? {
    label: '⚠ Overdue',
    color: '#ef4444',
    bg:    'rgba(239,68,68,0.06)',
    border:'rgba(239,68,68,0.20)',
    dot:   '#ef4444',
  } : {
    label: '◑ Partial Due',
    color: '#f59e0b',
    bg:    'rgba(245,158,11,0.06)',
    border:'rgba(245,158,11,0.20)',
    dot:   '#f59e0b',
  }

  const usedPct = creditLimit > 0 ? Math.min(100, ((outstanding + cartTotal) / creditLimit) * 100) : 0

  return (
    <div className="cpc-financial-widget" style={{ background: status.bg, borderColor: status.border }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="cpc-status-dot" style={{ background: status.dot, boxShadow: `0 0 6px ${status.dot}` }} />
          <span className="cpc-status-label" style={{ color: status.color }}>{status.label}</span>
        </div>
        {outstanding > 0 && (
          <span className="cpc-outstanding-amount" style={{ color: status.color }}>
            {fmtCurrency(outstanding)}
          </span>
        )}
      </div>

      {creditLimit > 0 && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-500 dark:text-indigo-300/60">Credit Utilization</span>
            <span style={{ color: status.color }} className="font-semibold">{usedPct.toFixed(0)}%</span>
          </div>
          <div className="cpc-credit-bar-track">
            <div
              className="cpc-credit-bar-fill"
              style={{
                width: `${usedPct}%`,
                background: usedPct > 90 ? '#ef4444' : usedPct > 70 ? '#f59e0b' : '#10b981',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
})
FinancialWidget.displayName = 'FinancialWidget'

// ── Search Result Row ──────────────────────────────────────────────────────────
const SearchResultRow = memo(({ customer: c, isHighlighted, onClick }) => {
  const balance = c.current_balance || 0
  const [g1, g2] = getGradient(c.name)
  const type = c.price_level || 'retail'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cpc-search-row ${isHighlighted ? 'cpc-search-row-active' : ''}`}
    >
      {/* Mini avatar */}
      <div
        className="cpc-mini-avatar flex-shrink-0 flex items-center justify-center rounded-xl text-white font-bold text-[11px]"
        style={{ background: `linear-gradient(135deg, ${g1} 0%, ${g2} 100%)`, boxShadow: `0 2px 8px ${g1}44` }}
      >
        {getInitials(c.name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="cpc-search-name">{c.name}</span>
          <TypeBadge type={type} />
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {c.mobile && (
            <span className="cpc-search-meta flex items-center gap-0.5">
              <Phone size={9} /> {c.mobile}
            </span>
          )}
          {c.gstin && (
            <span className="cpc-search-meta font-mono">{c.gstin.slice(0, 10)}…</span>
          )}
          {c.last_purchase_date && (
            <span className="cpc-search-meta">{daysSince(c.last_purchase_date)}</span>
          )}
        </div>
      </div>

      {/* Outstanding */}
      {balance > 0 && (
        <span className="cpc-search-balance flex-shrink-0">
          {fmtCurrency(balance)} due
        </span>
      )}
      {balance === 0 && (
        <span className="cpc-search-paid flex-shrink-0 flex items-center gap-0.5">
          <CheckCircle2 size={10} /> Paid
        </span>
      )}
    </button>
  )
})
SearchResultRow.displayName = 'SearchResultRow'

// ── Skeleton Row ───────────────────────────────────────────────────────────────
const SkeletonRow = () => (
  <div className="flex items-center gap-3 px-4 py-3">
    <div className="w-8 h-8 rounded-xl bg-gray-200/60 dark:bg-white/8 animate-pulse flex-shrink-0" />
    <div className="flex-1 space-y-1.5">
      <div className="h-3 bg-gray-200/60 dark:bg-white/8 rounded-full animate-pulse w-2/3" />
      <div className="h-2 bg-gray-200/40 dark:bg-white/5 rounded-full animate-pulse w-1/2" />
    </div>
    <div className="h-3 w-16 bg-gray-200/40 dark:bg-white/5 rounded-full animate-pulse" />
  </div>
)

// ── Recent Customer Chip ───────────────────────────────────────────────────────
const RecentChip = memo(({ customer, onSelect }) => {
  const [g1, g2] = getGradient(customer.name)
  return (
    <button
      type="button"
      onClick={() => onSelect(customer)}
      className="cpc-recent-chip flex-shrink-0 flex items-center gap-1.5"
    >
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
        style={{ fontSize: 8, background: `linear-gradient(135deg, ${g1} 0%, ${g2} 100%)` }}
      >
        {getInitials(customer.name).slice(0, 1)}
      </div>
      <span className="cpc-recent-chip-name">{customer.name.split(' ')[0]}</span>
    </button>
  )
})
RecentChip.displayName = 'RecentChip'

// ── MAIN EXPORT ────────────────────────────────────────────────────────────────
export default function CustomerPanel({ company, onCustomerChange, inputRef: extInputRef }) {
  const { activeCart, setCustomer, setIsIgst } = useCart()
  const { customer } = activeCart

  // ── Modal states ──────────────────────────────────────────────────────────────
  const [editModal, setEditModal]           = useState(false)
  const [editForm, setEditForm]             = useState(null)
  const [editSaving, setEditSaving]         = useState(false)
  const [historyModal, setHistoryModal]     = useState(false)
  const [historyData, setHistoryData]       = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [ledgerModal, setLedgerModal]       = useState(false)
  const [ledgerData, setLedgerData]         = useState(null)
  const [ledgerLoading, setLedgerLoading]   = useState(false)
  const [outstandingModal, setOutstandingModal]   = useState(false)
  const [outstandingData, setOutstandingData]     = useState(null)
  const [outstandingLoading, setOutstandingLoading] = useState(false)

  // ── Edit handlers ──────────────────────────────────────────────────────────────
  const openEdit = useCallback(() => {
    if (!customer) return
    setEditForm({
      name: customer.name || '',
      mobile: customer.mobile || '',
      email: customer.email || '',
      gstin: customer.gstin || '',
      credit_limit: customer.credit_limit || 0,
      price_level: customer.price_level || 'retail',
      is_active: customer.is_active !== false,
      address: customer.address || { street: '', city: '', state: '', pincode: '' },
    })
    setEditModal(true)
  }, [customer])

  const handleEditSave = useCallback(async () => {
    if (!customer || !editForm) return
    setEditSaving(true)
    try {
      const { data } = await customerAPI.update(customer.id, editForm)
      setCustomer({ ...customer, ...editForm, ...data })
      setEditModal(false)
    } catch (e) {
      alert(e?.response?.data?.detail || 'Save failed')
    } finally { setEditSaving(false) }
  }, [customer, editForm, setCustomer])

  const setEF = useCallback((k, v) => setEditForm(f => ({ ...f, [k]: v })), [])
  const setAddr = useCallback((k, v) => setEditForm(f => ({ ...f, address: { ...f.address, [k]: v } })), [])

  // ── History handlers ───────────────────────────────────────────────────────────
  const openHistory = useCallback(async () => {
    if (!customer) return
    setHistoryModal(true)
    setHistoryLoading(true)
    try {
      const { data } = await salesAPI.list({ customer_id: customer.id, limit: 50 })
      setHistoryData(data.items || [])
    } catch { setHistoryData([]) }
    finally { setHistoryLoading(false) }
  }, [customer])

  // ── Ledger handlers ────────────────────────────────────────────────────────────
  const openLedger = useCallback(async () => {
    if (!customer) return
    setLedgerModal(true)
    setLedgerLoading(true)
    try {
      const { data } = await customerAPI.ledger(customer.id)
      setLedgerData(data)
    } catch { setLedgerData(null) }
    finally { setLedgerLoading(false) }
  }, [customer])

  // ── Outstanding handlers ───────────────────────────────────────────────────────
  const openOutstanding = useCallback(async () => {
    if (!customer) return
    setOutstandingModal(true)
    setOutstandingLoading(true)
    try {
      const { data } = await customerAPI.ledger(customer.id)
      setOutstandingData(data)
    } catch { setOutstandingData(null) }
    finally { setOutstandingLoading(false) }
  }, [customer])

  // Search state
  const [searchQuery, setSearchQuery]   = useState('')
  const [results, setResults]           = useState([])
  const [searching, setSearching]       = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const [showDropdown, setShowDropdown] = useState(false)
  const [cardVisible, setCardVisible]   = useState(false)

  // Favorites (localStorage)
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cpc_favorites') || '[]') } catch { return [] }
  })
  const [recentCustomers, setRecentCustomers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cpc_recent') || '[]') } catch { return [] }
  })
  const [isPinned, setIsPinned] = useState(false)

  const debounceRef = useRef(null)
  const inputRef    = useRef(null)
  const dropdownRef = useRef(null)
  const mergedRef   = extInputRef || inputRef

  // ── Animate card in when customer changes ──────────────────────────────────
  useEffect(() => {
    if (customer) {
      setCardVisible(false)
      const t = setTimeout(() => setCardVisible(true), 30)
      setIsPinned(favorites.some(f => f.id === customer.id))
      return () => clearTimeout(t)
    }
  }, [customer?.id])

  // ── Business logic: auto IGST detection (PRESERVED) ───────────────────────
  const autoSetIgst = useCallback((cust) => {
    if (!company || !cust) return
    let customerStateCode = ''
    if (cust.gstin?.length >= 2) {
      customerStateCode = cust.gstin.slice(0, 2)
    } else if (cust.address?.state) {
      const matched = INDIAN_STATES.find(s => s.name === cust.address.state)
      if (matched) customerStateCode = matched.code
    }
    const companyStateCode = company.state_code || ''
    if (customerStateCode && companyStateCode) {
      setIsIgst(customerStateCode !== companyStateCode)
    }
  }, [company, setIsIgst])

  // ── Search handler (PRESERVED + debounce) ─────────────────────────────────
  const handleSearch = useCallback(async (q) => {
    setSearchQuery(q)
    setHighlightIdx(-1)
    if (!q.trim()) { setResults([]); setShowDropdown(false); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setShowDropdown(true)
      try {
        const { data } = await customerAPI.list({ search: q, limit: 30 })
        setResults(data.items || [])
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 180)
  }, [])

  // ── Select customer (PRESERVED) ───────────────────────────────────────────
  const handleSelect = useCallback((cust) => {
    setCustomer(cust)
    autoSetIgst(cust)
    onCustomerChange?.(cust)
    setSearchQuery('')
    setResults([])
    setShowDropdown(false)
    setHighlightIdx(-1)

    // Update recent customers list
    setRecentCustomers(prev => {
      const updated = [cust, ...prev.filter(c => c.id !== cust.id)].slice(0, 8)
      try { localStorage.setItem('cpc_recent', JSON.stringify(updated)) } catch {}
      return updated
    })
  }, [setCustomer, autoSetIgst, onCustomerChange])

  // ── Remove customer (PRESERVED) ───────────────────────────────────────────
  const handleRemove = useCallback(() => {
    setCustomer(null)
    setSearchQuery('')
    setResults([])
    setShowDropdown(false)
    setCardVisible(false)
    setTimeout(() => mergedRef?.current?.focus(), 100)
  }, [setCustomer, mergedRef])

  // ── Keyboard navigation in dropdown ───────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (!showDropdown || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault()
      handleSelect(results[highlightIdx])
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
      setHighlightIdx(-1)
    }
  }, [showDropdown, results, highlightIdx, handleSelect])

  // ── Scroll highlighted row into view ──────────────────────────────────────
  useEffect(() => {
    if (highlightIdx >= 0 && dropdownRef.current) {
      const row = dropdownRef.current.children[highlightIdx]
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [highlightIdx])

  // ── Toggle favorite ────────────────────────────────────────────────────────
  const toggleFavorite = useCallback(() => {
    if (!customer) return
    setFavorites(prev => {
      const isFav = prev.some(f => f.id === customer.id)
      const updated = isFav ? prev.filter(f => f.id !== customer.id) : [customer, ...prev].slice(0, 10)
      try { localStorage.setItem('cpc_favorites', JSON.stringify(updated)) } catch {}
      setIsPinned(!isFav)
      return updated
    })
  }, [customer])

  // ── Click outside closes dropdown ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.cpc-search-container')) {
        setShowDropdown(false)
        setHighlightIdx(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Computed values ────────────────────────────────────────────────────────
  const cartTotal      = activeCart.items.reduce((s, i) => s + (i.total || 0), 0)
  const outstanding    = customer?.current_balance || 0
  const creditLimit    = customer?.credit_limit    || 0
  const availCredit    = Math.max(0, creditLimit - outstanding - cartTotal)
  const totalExposure  = outstanding + cartTotal
  const creditExceeded = creditLimit > 0 && totalExposure > creditLimit
  const health         = customer ? getHealthScore(customer, creditExceeded) : null

  // ── Walk-in handler ────────────────────────────────────────────────────────
  const handleWalkIn = useCallback(() => {
    const walkIn = {
      id: 'walkin',
      name: 'Walk-in Customer',
      mobile: '',
      gstin: '',
      price_level: 'retail',
      current_balance: 0,
      credit_limit: 0,
    }
    handleSelect(walkIn)
  }, [handleSelect])

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Customer Selected
  // ─────────────────────────────────────────────────────────────────────────
  if (customer) {
    return (
      <>
        <div className={`cpc-card-root ${cardVisible ? 'cpc-card-visible' : 'cpc-card-hidden'}`}>

        {/* ── Three-column profile layout ──────────────────────────────── */}
        <div className="cpc-three-col">

          {/* ── LEFT: Identity ───────────────────────────────────────── */}
          <div className="cpc-left-col">
            {/* Avatar + pin */}
            <div className="relative self-start">
              <CustomerAvatar name={customer.name} size={52} animate={cardVisible} />
              <button
                type="button"
                onClick={toggleFavorite}
                title={isPinned ? 'Remove from favorites' : 'Add to favorites'}
                className="cpc-pin-btn"
                style={{ color: isPinned ? '#f59e0b' : undefined }}
              >
                <Star size={11} fill={isPinned ? '#f59e0b' : 'none'} />
              </button>
            </div>

            {/* Name + badge */}
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2 flex-wrap">
                <span className="cpc-customer-name">{customer.name}</span>
              </div>
              {customer.price_level && (
                <div className="mt-1">
                  <TypeBadge type={customer.price_level} />
                </div>
              )}
              {/* Contact details */}
              <div className="mt-2 space-y-1">
                {customer.mobile && (
                  <p className="cpc-contact-row">
                    <Phone size={10} className="flex-shrink-0 opacity-70" />
                    <span>{customer.mobile}</span>
                  </p>
                )}
                {customer.gstin && (
                  <p className="cpc-contact-row font-mono">
                    <CreditCard size={10} className="flex-shrink-0 opacity-70" />
                    <span>{customer.gstin}</span>
                  </p>
                )}
                {customer.email && (
                  <p className="cpc-contact-row truncate">
                    <span className="opacity-70">@</span>
                    <span className="truncate">{customer.email}</span>
                  </p>
                )}
              </div>

              {/* Health score */}
              {health && (
                <div
                  className="cpc-health-chip mt-2"
                  style={{ background: health.bg, color: health.color, borderColor: `${health.color}33` }}
                >
                  <health.icon size={10} />
                  <span>{health.label}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── CENTER: Stats ─────────────────────────────────────────── */}
          <div className="cpc-center-col">
            {/* Financial Widget */}
            <FinancialWidget
              outstanding={outstanding}
              creditLimit={creditLimit}
              creditExceeded={creditExceeded}
              cartTotal={cartTotal}
            />

            {/* Stat grid */}
            <div className="cpc-stat-grid">
              <StatChip
                label="Outstanding"
                value={fmtCurrency(outstanding)}
                accent={outstanding > 0 ? '#f59e0b' : '#10b981'}
              />
              <StatChip
                label="Credit Limit"
                value={creditLimit > 0 ? fmtCurrency(creditLimit) : '—'}
                accent="#6366f1"
              />
              <StatChip
                label="Avail Credit"
                value={creditLimit > 0 ? fmtCurrency(availCredit) : '∞'}
                accent={creditExceeded ? '#ef4444' : '#10b981'}
              />
              {customer.lifetime_purchase != null && (
                <StatChip
                  label="Lifetime"
                  value={fmtCurrency(customer.lifetime_purchase)}
                  accent="#6366f1"
                />
              )}
              {customer.last_purchase_date && (
                <StatChip
                  label="Last Purchase"
                  value={daysSince(customer.last_purchase_date)}
                  sub={customer.last_invoice_no ? `#${customer.last_invoice_no}` : undefined}
                  accent="#3b82f6"
                />
              )}
              {customer.avg_order_value != null && (
                <StatChip
                  label="Avg Order"
                  value={fmtCurrency(customer.avg_order_value)}
                  accent="#8b5cf6"
                />
              )}
            </div>

            {/* Credit exceeded banner */}
            {creditExceeded && (
              <div className="cpc-danger-banner">
                <AlertTriangle size={12} className="flex-shrink-0" />
                <span>Credit exceeded! Total exposure {fmtCurrency(totalExposure)}</span>
              </div>
            )}
          </div>

          {/* ── RIGHT: Actions + close ────────────────────────────────── */}
          <div className="cpc-right-col">
            {/* Close btn */}
            <button
              type="button"
              onClick={handleRemove}
              className="cpc-close-btn"
              title="Change customer"
            >
              <X size={13} />
            </button>

            {/* Action buttons */}
            <div className="cpc-action-grid">
              <ActionBtn
                icon={Edit3}
                label="Edit"
                accent="#6366f1"
                onClick={openEdit}
              />
              <ActionBtn
                icon={History}
                label="History"
                accent="#3b82f6"
                onClick={openHistory}
              />
              <ActionBtn
                icon={BookOpen}
                label="Ledger"
                accent="#8b5cf6"
                onClick={openLedger}
              />
              <ActionBtn
                icon={Wallet}
                label="Outstanding"
                accent={outstanding > 0 ? '#f59e0b' : '#10b981'}
                onClick={openOutstanding}
              />
              <ActionBtn
                icon={Phone}
                label="Call"
                accent="#10b981"
                onClick={() => customer.mobile && (window.location.href = `tel:${customer.mobile}`)}
              />
              <ActionBtn
                icon={MessageCircle}
                label="WhatsApp"
                accent="#25d366"
                onClick={() => customer.mobile && window.open(`https://wa.me/91${customer.mobile.replace(/\D/g, '')}`, '_blank')}
              />
            </div>

            {/* Tags */}
            {customer.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {customer.tags.slice(0, 3).map((tag, i) => (
                  <span key={i} className="cpc-tag">
                    <Tag size={8} /> {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════ EDIT CUSTOMER MODAL ══════════ */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title={`Edit - ${customer?.name}`} size="lg"
        footer={
          <>
            <button type="button" onClick={() => setEditModal(false)} className="btn-secondary">Cancel</button>
            <button type="button" onClick={handleEditSave} disabled={editSaving} className="btn-primary">
              {editSaving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</> : <><Save size={14} /> Save Changes</>}
            </button>
          </>
        }
      >
        {editForm && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Customer Name <span className="text-red-500">*</span></label>
              <input className="input" value={editForm.name} onChange={e => setEF('name', e.target.value)} placeholder="Full name" />
            </div>
            <div>
              <label className="label">Mobile</label>
              <input className="input" value={editForm.mobile} onChange={e => setEF('mobile', e.target.value)} placeholder="10-digit number" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={editForm.email} onChange={e => setEF('email', e.target.value)} placeholder="email@example.com" />
            </div>
            <div>
              <label className="label">GSTIN</label>
              <input className="input font-mono" value={editForm.gstin} onChange={e => setEF('gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" />
            </div>
            <div>
              <label className="label">Price Level</label>
              <select className="select" value={editForm.price_level} onChange={e => setEF('price_level', e.target.value)}>
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
                <option value="distributor">Distributor</option>
                <option value="hospital">Hospital</option>
              </select>
            </div>
            <div>
              <label className="label">Credit Limit ₹</label>
              <input type="number" className="input" value={editForm.credit_limit} onChange={e => setEF('credit_limit', parseFloat(e.target.value) || 0)} min="0" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <input className="input" placeholder="Street" value={editForm.address?.street || ''} onChange={e => setAddr('street', e.target.value)} />
                </div>
                <input className="input" placeholder="City" value={editForm.address?.city || ''} onChange={e => setAddr('city', e.target.value)} />
                <input className="input" placeholder="State" value={editForm.address?.state || ''} onChange={e => setAddr('state', e.target.value)} />
                <input className="input" placeholder="Pincode" value={editForm.address?.pincode || ''} onChange={e => setAddr('pincode', e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editForm.is_active} onChange={e => setEF('is_active', e.target.checked)} className="rounded" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
            </label>
          </div>
        )}
      </Modal>

      {/* ══════════ SALES HISTORY MODAL ══════════ */}
      <Modal open={historyModal} onClose={() => setHistoryModal(false)} title={`Sales History - ${customer?.name}`} size="2xl">
        {historyLoading ? (
          <div className="flex items-center justify-center py-16"><Spinner size={28} /></div>
        ) : historyData.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <History size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No sales found for this customer</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200/50 dark:border-white/8">
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th className="text-right">Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {historyData.map(s => (
                  <tr key={s.id}>
                    <td className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">{s.invoice_no || `#${s.id}`}</td>
                    <td>{fmtDate(s.invoice_date || s.created_at)}</td>
                    <td className="text-right font-bold">₹{(s.grand_total || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="capitalize text-sm text-gray-500">{s.payment_mode || '—'}</td>
                    <td>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                        s.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400' :
                        s.payment_status === 'partial' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-400' :
                        'bg-red-50 text-red-700 dark:bg-red-900/25 dark:text-red-400'
                      }`}>{s.payment_status || 'pending'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-indigo-200/40 dark:border-indigo-700/30 bg-indigo-50/30 dark:bg-indigo-900/10">
                  <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-gray-500">{historyData.length} invoices</td>
                  <td className="px-4 py-2.5 text-right font-bold text-indigo-700 dark:text-indigo-300">
                    ₹{historyData.reduce((s, i) => s + (i.grand_total || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Modal>

      {/* ══════════ LEDGER MODAL ══════════ */}
      <Modal open={ledgerModal} onClose={() => setLedgerModal(false)} title={`Ledger - ${customer?.name}`} size="2xl">
        {ledgerLoading ? (
          <div className="flex items-center justify-center py-16"><Spinner size={28} /></div>
        ) : !ledgerData ? (
          <div className="text-center py-16 text-gray-400">
            <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
            <p>No ledger data available</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="card p-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1">Current Balance</p>
                <p className="text-lg font-black text-indigo-700 dark:text-indigo-300">₹{(ledgerData.customer?.current_balance || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-1">Credit Limit</p>
                <p className="text-lg font-black text-emerald-700 dark:text-emerald-300">₹{(ledgerData.customer?.credit_limit || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-orange-500 mb-1">Price Level</p>
                <p className="text-lg font-black text-orange-700 dark:text-orange-300 capitalize">{ledgerData.customer?.price_level || '—'}</p>
              </div>
            </div>
            {/* Ledger table */}
            <div className="overflow-x-auto rounded-xl border border-gray-200/50 dark:border-white/8">
              <table className="table w-full text-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Reference</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(ledgerData.entries || []).map((e, i) => (
                    <tr key={i}>
                      <td className="text-sm">{fmtDate(e.date)}</td>
                      <td><span className="badge badge-blue capitalize">{e.type}</span></td>
                      <td className="text-sm text-gray-500 dark:text-gray-400">{e.reference || '—'}</td>
                      <td className="text-right text-red-600 font-medium">{e.debit > 0 ? `₹${e.debit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}</td>
                      <td className="text-right text-emerald-600 font-medium">{e.credit > 0 ? `₹${e.credit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}</td>
                      <td className="text-right font-semibold">₹{(e.balance || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  {!ledgerData.entries?.length && (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-400">No ledger entries found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* ══════════ OUTSTANDING MODAL ══════════ */}
      <Modal open={outstandingModal} onClose={() => setOutstandingModal(false)} title={`Outstanding - ${customer?.name}`} size="xl">
        {outstandingLoading ? (
          <div className="flex items-center justify-center py-16"><Spinner size={28} /></div>
        ) : !outstandingData ? (
          <div className="text-center py-16 text-gray-400">
            <Wallet size={40} className="mx-auto mb-3 opacity-30" />
            <p>No outstanding data available</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Outstanding summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className={`card p-5 text-center ${
                (outstandingData.customer?.current_balance || 0) > 0 ? 'border-orange-200 dark:border-orange-800/40' : 'border-emerald-200 dark:border-emerald-800/40'
              }`}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Outstanding Balance</p>
                <p className={`text-2xl font-black ${
                  (outstandingData.customer?.current_balance || 0) > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}>
                  ₹{(outstandingData.customer?.current_balance || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {(outstandingData.customer?.current_balance || 0) > 0 ? '⚠ Amount receivable from customer' : '✓ No outstanding balance'}
                </p>
              </div>
              <div className="card p-5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Credit Limit</p>
                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                  ₹{(outstandingData.customer?.credit_limit || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-400 mt-1">Available: ₹{Math.max(0, (outstandingData.customer?.credit_limit || 0) - (outstandingData.customer?.current_balance || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
            </div>
            {/* Recent unpaid entries */}
            {outstandingData.entries?.filter(e => e.debit > 0).length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-orange-200/50 dark:border-orange-800/30">
                <table className="table w-full text-sm">
                  <thead className="bg-orange-50/50 dark:bg-orange-900/10">
                    <tr>
                      <th>Date</th>
                      <th>Reference</th>
                      <th className="text-right">Amount Due</th>
                      <th className="text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstandingData.entries.filter(e => e.debit > 0).map((e, i) => (
                      <tr key={i}>
                        <td className="text-sm">{fmtDate(e.date)}</td>
                        <td className="text-sm text-gray-500">{e.reference || '—'}</td>
                        <td className="text-right text-orange-600 font-semibold">₹{e.debit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                        <td className="text-right font-semibold">₹{(e.balance || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!outstandingData.entries?.filter(e => e.debit > 0).length && (
              <div className="text-center py-8 text-emerald-600">
                <CheckCircle2 size={36} className="mx-auto mb-2" />
                <p className="font-semibold">All clear! No pending dues.</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Search Mode
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="cpc-search-container space-y-2">

      {/* ── Animated search bar ──────────────────────────────────────── */}
      <div className="cpc-searchbar-wrap">
        {/* Left icon + divider */}
        <div className="flex items-center gap-2.5 flex-shrink-0 pl-3.5">
          <Search size={15} className="text-indigo-400/80 dark:text-indigo-300/60" />
          <div className="w-px h-4 bg-gray-200/80 dark:bg-white/10" />
        </div>

        {/* Input */}
        <input
          ref={mergedRef}
          type="text"
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setShowDropdown(true) }}
          placeholder="Search customer… (F4)"
          className="cpc-search-input"
          autoComplete="off"
          spellCheck="false"
        />

        {/* Right side */}
        <div className="flex items-center gap-1.5 pr-2 flex-shrink-0">
          {searching && (
            <div className="w-4 h-4 border-2 border-indigo-400/40 border-t-indigo-500 rounded-full animate-spin" />
          )}
          {searchQuery && !searching && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setResults([]); setShowDropdown(false); mergedRef?.current?.focus() }}
              className="cpc-clear-btn"
            >
              <X size={12} />
            </button>
          )}
          <kbd className="cpc-kbd">F4</kbd>
        </div>
      </div>

      {/* ── Dropdown ─────────────────────────────────────────────────── */}
      {showDropdown && (
        <div className="cpc-dropdown" ref={dropdownRef}>
          {searching ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : results.length === 0 ? (
            <div className="cpc-empty-state">
              <div className="cpc-empty-icon">
                <Users size={22} className="text-indigo-400" />
              </div>
              <p className="cpc-empty-title">No customers found</p>
              <p className="cpc-empty-sub">Try a different name, phone, or GSTIN</p>
            </div>
          ) : (
            results.map((c, i) => (
              <SearchResultRow
                key={c.id}
                customer={c}
                isHighlighted={i === highlightIdx}
                onClick={() => handleSelect(c)}
              />
            ))
          )}

          {/* Keyboard hint footer */}
          {results.length > 0 && (
            <div className="cpc-dropdown-footer">
              <span><kbd className="cpc-kbd-sm">↑↓</kbd> Navigate</span>
              <span><kbd className="cpc-kbd-sm">↵</kbd> Select</span>
              <span><kbd className="cpc-kbd-sm">Esc</kbd> Close</span>
            </div>
          )}
        </div>
      )}

      {/* ── Quick action chips ────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" onClick={handleWalkIn} className="cpc-quick-chip cpc-quick-chip-primary">
          <UserPlus size={11} /> Walk-in
        </button>
        <button type="button" className="cpc-quick-chip">
          <Clock size={11} /> Recent
        </button>
        <button type="button" className="cpc-quick-chip">
          <Heart size={11} /> Favorites
        </button>
        {favorites.length > 0 && (
          <span className="cpc-quick-divider" />
        )}
        {favorites.slice(0, 3).map(f => (
          <button key={f.id} type="button" onClick={() => handleSelect(f)} className="cpc-quick-chip">
            <Star size={10} className="text-amber-500" fill="#f59e0b" />
            {f.name.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* ── Recent customers horizontal strip ────────────────────────── */}
      {recentCustomers.length > 0 && !searchQuery && (
        <div className="cpc-recent-strip">
          <span className="cpc-recent-label">
            <Clock size={9} /> Recent
          </span>
          <div className="cpc-recent-scroll">
            {recentCustomers.map(c => (
              <RecentChip key={c.id} customer={c} onSelect={handleSelect} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
