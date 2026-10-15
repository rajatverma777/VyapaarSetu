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

    let lastY = container.scrollTop
    let rafId = null

    const handleScroll = () => {
      if (rafId !== null) return

      rafId = window.requestAnimationFrame(() => {
        rafId = null
        const currentY = container.scrollTop
        const delta = currentY - lastY

        // When near top: always show
        if (currentY <= 20) {
          setNavVisible(true)
        } else if (delta > 4) {
          // Scrolling down (reading content) -> hide
          setNavVisible(false)
        } else if (delta < -4) {
          // Scrolling up (returning to top) -> show
          setNavVisible(true)
        }

        lastY = currentY
      })
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      container.removeEventListener('scroll', handleScroll)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [location.pathname])

  return (
    <div className="flex h-screen ambient-bg overflow-hidden relative">

      {/* ── MAIN CONTENT (Full Width without left sidebar) ───────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10 p-3.5 lg:p-4 min-w-0">
        <main className="flex-1 overflow-hidden relative bg-white/45 dark:bg-[#121318]/45 border border-white/60 dark:border-white/[0.14] rounded-[22px] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.95)] dark:shadow-[0_24px_64px_-10px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.25)] flex flex-col min-h-0" style={{ backdropFilter: 'blur(44px) saturate(190%) brightness(1.12)', WebkitBackdropFilter: 'blur(44px) saturate(190%) brightness(1.12)' }}>

          {/* TopNavbar floating inside glass panel */}
          <TopNavbar visible={navVisible} />

          {/* Scrollable page content — extra top padding prevents overlap with TopNavbar */}
          <div
            ref={scrollContainerRef}
            className={`flex-1 min-h-0 h-full ${
              isPosPage
                ? 'overflow-hidden pt-[68px] px-3 lg:px-4 pb-3 flex flex-col'
                : 'overflow-y-auto pt-[82px] lg:pt-[90px] px-4 lg:px-6 pb-28 lg:pb-32'
            }`}
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
