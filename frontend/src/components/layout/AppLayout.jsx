import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopNavbar from './TopNavbar'
import CommandPalette from '../ui/CommandPalette'
import { Plus, ShoppingCart, ShoppingBag, FileText, X, ChevronLeft, ChevronRight } from 'lucide-react'

// FAB quick actions
const FAB_ACTIONS = [
  { label: 'New Sale',     to: '/sales/new',    icon: ShoppingCart, bg: 'linear-gradient(135deg,#10b981,#059669)' },
  { label: 'New Purchase', to: '/purchases/new', icon: ShoppingBag,  bg: 'linear-gradient(135deg,#f59e0b,#d97706)' },
  { label: 'New Document', to: '/documents/new', icon: FileText,     bg: 'linear-gradient(135deg,#6366f1,#4f46e5)' },
]

function QuickActionFAB() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  return (
    <>
      {/* Backdrop blur overlay */}
      {open && (
        <div 
          onClick={() => setOpen(false)}
          className="fab-backdrop"
        />
      )}

      <div className="fab-container no-print">
        {open && (
          <div className="fab-actions">
            {FAB_ACTIONS.map((action, i) => {
              const Icon = action.icon
              return (
                <div key={action.to} className="fab-action-item" style={{ animationDelay: `${i * 40}ms` }}>
                  <span className="fab-action-label">{action.label}</span>
                  <button className="fab-action-btn" onClick={() => { navigate(action.to); setOpen(false) }} style={{ background: action.bg }}>
                    <Icon size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <button className="fab-main" onClick={() => setOpen(o => !o)} aria-label="Quick actions">
          <div style={{ transform: open ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform 250ms cubic-bezier(0.34,1.56,0.64,1)' }}>
            {open ? <X size={20} /> : <Plus size={20} />}
          </div>
        </button>
      </div>
    </>
  )
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarMini, setSidebarMini] = useState(() => {
    try { return localStorage.getItem('sidebar-mini') === 'true' } catch { return false }
  })
  const location = useLocation()

  // On editor pages, always force mini sidebar so the document gets max space
  // but we NEVER hide it completely — user always has the mini sidebar visible
  const isEditorPage = location.pathname.startsWith('/documents/') && location.pathname !== '/documents'
  const effectiveMini = isEditorPage ? true : sidebarMini

  // Page-transition key
  const [pageKey, setPageKey] = useState(location.pathname)
  useEffect(() => {
    setPageKey(location.pathname)
    setMobileOpen(false)
  }, [location.pathname])

  const toggleMini = useCallback(() => {
    // On editor pages, do nothing (mini is forced)
    if (isEditorPage) return
    setSidebarMini(prev => {
      const next = !prev
      try { localStorage.setItem('sidebar-mini', String(next)) } catch {}
      return next
    })
  }, [isEditorPage])

  // Width tokens
  const MINI_W  = 'calc(var(--sidebar-mini-width) + 12px)'   // 60px + 12px padding
  const FULL_W  = 'calc(var(--sidebar-width)      + 12px)'   // 230px + 12px padding

  return (
    <div className="flex h-screen ambient-bg overflow-hidden relative">

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/35 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      {/* Desktop: always visible, width animates between full / mini */}
      <aside
        className="hidden lg:block flex-shrink-0 p-3 pr-0 sidebar-transition relative"
        style={{ 
          width: effectiveMini ? MINI_W : FULL_W,
          '--sb-dur': '180ms',
          // Safari requires explicit WebkitTransition on inline styles
          // (React does not auto-prefix transition in style prop)
          WebkitTransition: `width 180ms ease-out, -webkit-transform 180ms ease-out`,
          transition: `width 180ms ease-out, transform 180ms ease-out`,
        }}
      >
        <div className="h-full overflow-hidden rounded-[20px]">
          <Sidebar
            onClose={() => {}}
            mini={effectiveMini}
            onToggleMini={isEditorPage ? null : toggleMini}
          />
        </div>
      </aside>
 
      {/* Mobile: slide-in overlay sidebar (always full-width) */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-30 p-3 sidebar-transition ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ 
          width: FULL_W,
          '--sb-dur': '180ms'
        }}
      >
        <Sidebar
          onClose={() => setMobileOpen(false)}
          mini={false}
          onToggleMini={null}
        />
      </aside>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10 p-3.5 lg:p-4 min-w-0">
        <main className="flex-1 overflow-hidden bg-white/45 dark:bg-white/[0.03] border border-white/60 dark:border-white/10 rounded-[20px] shadow-[inset_0_1.5px_1.5px_rgba(255,255,255,0.3)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] flex flex-col min-h-0">

          {/* TopNavbar inside glass panel */}
          <TopNavbar onMenuToggle={() => setMobileOpen(o => !o)} />

          {/* Scrollable page content */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            <div key={pageKey} className="page-transition-enter">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* Global overlays */}
      <CommandPalette />
      <QuickActionFAB />
    </div>
  )
}
