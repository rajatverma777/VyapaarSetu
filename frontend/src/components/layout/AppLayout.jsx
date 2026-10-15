import { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import TopNavbar from './TopNavbar'
import BottomNav from './BottomNav'
import CommandPalette from '../ui/CommandPalette'
import { healthAPI } from '../../services/api'

export default function AppLayout() {
  const location = useLocation()
  const [navVisible, setNavVisible] = useState(true)
  const lastScrollY = useRef(0)
  const scrollContainerRef = useRef(null)

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

  // Page-transition key & reset nav visibility on navigation
  const [pageKey, setPageKey] = useState(location.pathname)
  useEffect(() => {
    setPageKey(location.pathname)
    setNavVisible(true)
    lastScrollY.current = 0
  }, [location.pathname])

  // Scroll detection: auto-hide navbar & bottom nav on scroll down, reveal on scroll up
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    let ticking = false

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentY = container.scrollTop
          const delta = currentY - lastScrollY.current

          // Near top: always visible
          if (currentY <= 30) {
            setNavVisible(true)
          } else if (Math.abs(delta) > 8) {
            // Scrolling down (reading content) -> hide
            // Scrolling up (returning to top) -> show
            if (delta > 0) {
              setNavVisible(false)
            } else {
              setNavVisible(true)
            }
          }

          lastScrollY.current = currentY
          ticking = false
        })
        ticking = true
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [location.pathname])

  return (
    <div className="flex h-screen ambient-bg overflow-hidden relative">

      {/* ── MAIN CONTENT (Full Width without left sidebar) ───────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10 p-3.5 lg:p-4 min-w-0">
        <main className="flex-1 overflow-hidden relative bg-white/45 dark:bg-[#121318]/45 border border-white/60 dark:border-white/[0.14] rounded-[22px] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.95)] dark:shadow-[0_24px_64px_-10px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.25)] flex flex-col min-h-0" style={{ backdropFilter: 'blur(44px) saturate(190%) brightness(1.12)', WebkitBackdropFilter: 'blur(44px) saturate(190%) brightness(1.12)' }}>

          {/* TopNavbar floating inside glass panel */}
          <TopNavbar visible={navVisible} />

          {/* Scrollable page content — content scrolls underneath floating TopNavbar & BottomNav */}
          <div
            ref={scrollContainerRef}
            className={`flex-1 min-h-0 h-full ${isPosPage ? 'overflow-hidden pt-[62px] p-2.5 lg:p-3 flex flex-col' : 'overflow-y-auto pt-[70px] p-4 lg:p-6 pb-28 lg:pb-28'}`}
          >
            <div key={pageKey} className="page-transition-enter flex-1 flex flex-col min-h-0">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* Global overlays */}
      <CommandPalette />

      {/* Apple Photos-inspired floating bottom navigation */}
      <BottomNav visible={navVisible} />
    </div>
  )
}
