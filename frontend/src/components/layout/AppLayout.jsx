import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import TopNavbar from './TopNavbar'
import BottomNav from './BottomNav'
import CommandPalette from '../ui/CommandPalette'
import { healthAPI } from '../../services/api'

export default function AppLayout() {
  const location = useLocation()

  // Background warm-up to wake up Render free tier backend instantly on mount and periodically
  useEffect(() => {
    const warmUp = async () => {
      try {
        await healthAPI.check()
      } catch (err) {
        // Silently handle error (health ping is best-effort)
      }
    }
    warmUp()
    const interval = setInterval(warmUp, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const isPosPage = location.pathname === '/sales/new'

  // Page-transition key
  const [pageKey, setPageKey] = useState(location.pathname)
  useEffect(() => {
    setPageKey(location.pathname)
  }, [location.pathname])

  return (
    <div className="flex h-screen ambient-bg overflow-hidden relative">

      {/* ── MAIN CONTENT (Full Width without left sidebar) ───────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10 p-3.5 lg:p-4 min-w-0">
        <main className="flex-1 overflow-hidden bg-white/65 dark:bg-[#121316] border border-black/[0.06] dark:border-white/[0.08] rounded-[20px] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_24px_64px_-10px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.10)] flex flex-col min-h-0" style={{ backdropFilter: 'blur(36px) saturate(160%)', WebkitBackdropFilter: 'blur(36px) saturate(160%)' }}>

          {/* TopNavbar inside glass panel */}
          <TopNavbar />

          {/* Scrollable page content — extra bottom padding so BottomNav never covers content */}
          <div className={`flex-1 min-h-0 ${isPosPage ? 'overflow-hidden p-2.5 lg:p-3 flex flex-col' : 'overflow-y-auto p-4 lg:p-6 pb-28 lg:pb-28'}`}>
            <div key={pageKey} className="page-transition-enter flex-1 flex flex-col min-h-0">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* Global overlays */}
      <CommandPalette />

      {/* Apple Photos-inspired floating bottom navigation */}
      <BottomNav />
    </div>
  )
}
