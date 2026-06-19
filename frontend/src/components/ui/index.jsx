import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, ChevronLeft, ChevronRight, AlertTriangle, Search, ChevronDown, Check } from 'lucide-react'

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, size = 'md', footer }) {
  const sizeMap = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-6xl', full: 'max-w-[95vw]' }

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-backdrop-in" onClick={onClose} />
      <div className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full ${sizeMap[size]} max-h-[90vh] flex flex-col animate-modal-in`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="btn-icon text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 20 }) {
  return <Loader2 size={size} className="animate-spin text-primary-600" />
}

export function LoadingScreen() {
  return (
    <div className="animate-pulse space-y-6 w-full py-2">
      {/* Top Stat Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-white/45 dark:bg-white/5 border border-white/60 dark:border-white/10 rounded-[20px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]" />
        ))}
      </div>
      
      {/* Lower Row Skeletons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-white/45 dark:bg-white/5 border border-white/60 dark:border-white/10 rounded-[20px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]" />
        ))}
      </div>

      {/* Main content split panel skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-72 bg-white/45 dark:bg-white/5 border border-white/60 dark:border-white/10 rounded-[20px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]" />
        <div className="h-72 bg-white/45 dark:bg-white/5 border border-white/60 dark:border-white/10 rounded-[20px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]" />
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <div className="animate-pulse space-y-3 w-full py-4">
      <div className="flex gap-4 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-4 bg-gray-200/60 dark:bg-white/15 rounded flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3 items-center border-b border-gray-100 dark:border-gray-700/50">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-5 bg-gray-200/50 dark:bg-white/10 rounded flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Form Skeleton ─────────────────────────────────────────────────────────────
export function FormSkeleton() {
  return (
    <div className="card p-6 animate-pulse space-y-6">
      <div className="h-6 bg-gray-200/50 dark:bg-white/10 rounded w-1/4 mb-4" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 bg-gray-200/50 dark:bg-white/10 rounded w-1/3" />
            <div className="h-10 bg-gray-200/30 dark:bg-white/5 border border-gray-200/40 dark:border-white/5 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Confirm Dialog ─────────────────────────────────────────────────────────────
export function ConfirmDialog({ open, onClose, onConfirm, title, message, danger }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={() => { onConfirm(); onClose() }} className={danger ? 'btn-danger' : 'btn-primary'}>
          Confirm
        </button>
      </>}
    >
      <div className="flex gap-3">
        {danger && <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />}
        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
      </div>
    </Modal>
  )
}

// ── Pagination ────────────────────────────────────────────────────────────────
export function Pagination({ page, total, limit, onChange }) {
  const pages = Math.ceil(total / limit)
  if (pages <= 1) return null
  const from = (page - 1) * limit + 1
  const to   = Math.min(page * limit, total)

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onChange(page-1)} className="btn-icon disabled:opacity-40">
          <ChevronLeft size={16} />
        </button>
        {Array.from({ length: Math.min(5, pages) }, (_, i) => {
          let p = i + 1
          if (pages > 5) {
            if (page <= 3) p = i + 1
            else if (page >= pages - 2) p = pages - 4 + i
            else p = page - 2 + i
          }
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                p === page ? 'bg-indigo-500/20 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 dark:border-indigo-400/30 font-bold backdrop-blur-sm' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {p}
            </button>
          )
        })}
        <button disabled={page >= pages} onClick={() => onChange(page+1)} className="btn-icon disabled:opacity-40">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <div className="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
        <Icon size={26} className="text-gray-400" />
      </div>}
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      {action}
    </div>
  )
}

// ── Form Field ─────────────────────────────────────────────────────────────────
export function FormField({ label, error, required, children, hint }) {
  return (
    <div>
      {label && <label className="label">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>}
      {children}
      {hint  && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ── Status Badge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    paid:     'badge-green',
    partial:  'badge-yellow',
    unpaid:   'badge-red',
    pending:  'badge-yellow',
    active:   'badge-green',
    inactive: 'badge-gray',
    purchase: 'badge-blue',
    sale:     'badge-green',
    return:   'badge-red',
  }
  return <span className={map[status] || 'badge-gray'}>{status}</span>
}

// ── Search Input ──────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div className={`search-glass-wrap ${className}`}>
      <svg className="search-glass-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="search-glass-input"
      />
    </div>
  )
}

// ── Amount Display ─────────────────────────────────────────────────────────────
export function Amount({ value = 0, className = '' }) {
  return (
    <span className={`font-mono ${className}`}>
      ₹{Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  )
}

export function SearchAutocomplete({ onSelect, onSearch, placeholder = 'Search…', itemTemplate, inputRef, className = '' }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [showDrop, setShowDrop] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(0)
  const containerRef = useRef()
  const listRef = useRef()

  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setShowDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (search.length < 1) { setResults([]); setShowDrop(false); return }
    const t = setTimeout(async () => {
      try {
        const res = await onSearch(search)
        setResults(res)
        setShowDrop(true)
      } catch { }
    }, 250)
    return () => clearTimeout(t)
  }, [search, onSearch])

  // Reset highlight index when results change
  useEffect(() => {
    setFocusedIdx(0)
  }, [results])

  // Scroll focused option into view
  useEffect(() => {
    if (showDrop && listRef.current && focusedIdx >= 0) {
      const el = listRef.current.children[focusedIdx]
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIdx, showDrop])

  const triggerSearchAll = async () => {
    try {
      const res = await onSearch('')
      setResults(res)
      setShowDrop(true)
    } catch { }
  }

  const handleKeyDown = (e) => {
    if (!showDrop || results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      if (focusedIdx >= 0 && focusedIdx < results.length) {
        e.preventDefault()
        const selectedItem = results[focusedIdx]
        onSelect(selectedItem)
        setSearch('')
        setResults([])
        setShowDrop(false)
        setFocusedIdx(0)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setShowDrop(false)
    }
  }

  return (
    <div className={`search-glass-wrap relative ${className}`} ref={containerRef}>
      <Search size={15} 
              className="search-glass-icon cursor-pointer hover:text-indigo-500 transition-colors pointer-events-auto" 
              onClick={triggerSearchAll} 
      />
      <input 
        ref={inputRef}
        value={search} 
        onChange={e => setSearch(e.target.value)}
        onFocus={() => { if (results.length > 0) setShowDrop(true) }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder} 
        className="search-glass-input" 
      />
      {showDrop && results.length > 0 && (
        <div ref={listRef} className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 max-h-60 overflow-y-auto">
          {results.map((item, idx) => {
            const isFocused = idx === focusedIdx
            return (
              <div 
                key={item.id || idx}
                onClick={() => { onSelect(item); setSearch(''); setResults([]); setShowDrop(false); setFocusedIdx(0) }}
                onMouseEnter={() => setFocusedIdx(idx)}
                className={`cursor-pointer transition-colors duration-150 ${isFocused ? 'bg-indigo-50 dark:bg-indigo-900/35 border-l-2 border-indigo-600 dark:border-indigo-400' : 'border-l-2 border-transparent'}`}
              >
                {itemTemplate(item)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function GlassSelect({ value, onChange, options = [], placeholder = 'Select…', className = '' }) {
  const [open, setOpen]           = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [panelStyle, setPanelStyle] = useState({})
  const triggerRef = useRef()
  const listRef    = useRef()

  const selected = options.find(o => String(o.value) === String(value))

  // ── Position the portal panel below the trigger ────────────────────────────
  const calcPosition = useCallback(() => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPanelStyle({
      position: 'fixed',
      top:      r.bottom + window.scrollY + 6,
      left:     r.left   + window.scrollX,
      width:    r.width,
      zIndex:   99999,
    })
  }, [])

  // ── Open / close helpers ───────────────────────────────────────────────────
  const openMenu  = () => { calcPosition(); setOpen(true)  }
  const closeMenu = () => { setOpen(false); setFocusedIdx(-1) }
  const toggle    = () => { open ? closeMenu() : openMenu() }

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        listRef.current    && !listRef.current.contains(e.target)
      ) closeMenu()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // ── Reposition on scroll / resize ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const update = () => calcPosition()
    window.addEventListener('scroll',  update, true)
    window.addEventListener('resize',  update)
    return () => {
      window.removeEventListener('scroll',  update, true)
      window.removeEventListener('resize',  update)
    }
  }, [open, calcPosition])

  // ── Auto-highlight the current value when opening ─────────────────────────
  useEffect(() => {
    if (!open) return
    const idx = options.findIndex(o => String(o.value) === String(value))
    setFocusedIdx(idx >= 0 ? idx : 0)
  }, [open])

  // ── Scroll focused item into view ─────────────────────────────────────────
  useEffect(() => {
    if (open && listRef.current && focusedIdx >= 0) {
      // children[0] is the shine strip, so offset by 1
      const el = listRef.current.children[focusedIdx + 1]
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIdx, open])

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault(); openMenu()
      }
      return
    }
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, options.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && focusedIdx >= 0) {
      e.preventDefault()
      onChange(options[focusedIdx].value)
      closeMenu()
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className={`gls-wrap ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* ── Trigger ── */}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        className={`gls-trigger ${open ? 'gls-trigger--open' : ''}`}
      >
        <span className={`gls-trigger-label ${!selected ? 'gls-trigger-label--placeholder' : ''}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className={`gls-chevron-wrap ${open ? 'gls-chevron-wrap--open' : ''}`}>
          <ChevronDown size={14} strokeWidth={2.5} />
        </span>
      </button>

      {/* ── Portal panel — renders into document.body, escapes every z-index ── */}
      {open && createPortal(
        <div
          role="listbox"
          ref={listRef}
          className="gls-panel"
          style={panelStyle}
          aria-activedescendant={focusedIdx >= 0 ? `gls-opt-${focusedIdx}` : undefined}
        >
          {/* Glass shine strip */}
          <div className="gls-panel-shine" aria-hidden="true" />

          {options.map((opt, idx) => {
            const isActive  = String(opt.value) === String(value)
            const isFocused = idx === focusedIdx
            return (
              <button
                key={opt.value}
                id={`gls-opt-${idx}`}
                role="option"
                type="button"
                aria-selected={isActive}
                onMouseEnter={() => setFocusedIdx(idx)}
                onClick={() => { onChange(opt.value); closeMenu() }}
                className={[
                  'gls-option',
                  isActive  ? 'gls-option--active'  : '',
                  isFocused ? 'gls-option--focused' : '',
                ].join(' ')}
              >
                <span className="gls-option-bar"  aria-hidden="true" />
                <span className="gls-option-label">{opt.label}</span>
                <span className={`gls-option-check ${isActive ? 'gls-option-check--visible' : ''}`}>
                  <Check size={14} strokeWidth={3} />
                </span>
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}

export function DatePicker({ value, onChange, className = '' }) {
  const [open, setOpen] = useState(false)
  const [currentDate, setCurrentDate] = useState(() => {
    const d = value ? new Date(value) : new Date()
    return isNaN(d.getTime()) ? new Date() : d
  })
  const containerRef = useRef()

  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (value) {
      const d = new Date(value)
      if (!isNaN(d.getTime())) {
        setCurrentDate(d)
      }
    }
  }, [value])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const handleSelectDay = (day) => {
    const formattedMonth = String(month + 1).padStart(2, '0')
    const formattedDay = String(day).padStart(2, '0')
    const dateStr = `${year}-${formattedMonth}-${formattedDay}`
    onChange(dateStr)
    setOpen(false)
  }

  const days = []
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="w-8 h-8" />)
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const formattedMonth = String(month + 1).padStart(2, '0')
    const formattedDay = String(d).padStart(2, '0')
    const dateStr = `${year}-${formattedMonth}-${formattedDay}`
    const isSelected = value === dateStr
    const isToday = new Date().toDateString() === new Date(year, month, d).toDateString()

    days.push(
      <button
        key={d}
        type="button"
        onClick={() => handleSelectDay(d)}
        className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold transition-all ${
          isSelected
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
            : isToday
            ? 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/30'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
        }`}
      >
        {d}
      </button>
    )
  }

  const displayValue = () => {
    if (!value) return ''
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="search-glass-wrap">
        <svg className="search-glass-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <input
          type="text"
          readOnly
          onClick={() => setOpen(!open)}
          value={displayValue()}
          placeholder="Select date..."
          className="search-glass-input cursor-pointer"
        />
      </div>

      {open && (
        <div className="gls-panel absolute top-full mt-2 left-0 w-72 p-4 z-50">
          <div className="gls-panel-shine" aria-hidden="true" />
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-gray-900 dark:text-white">
              {monthNames[month]} {year}
            </h4>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-400"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-400"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {days}
          </div>
        </div>
      )}
    </div>
  )
}
