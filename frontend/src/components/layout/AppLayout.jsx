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
  const isSettingsPage = location.pathname === '/settings'

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
    <div className="flex h-screen h-[100dvh] ambient-bg overflow-hidden relative w-full">

      {/* ── MAIN CONTENT (Edge-to-Edge Full Screen without artificial box framing) ── */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10 min-w-0 w-full h-full">
        <main className="flex-1 overflow-hidden relative flex flex-col min-h-0 w-full h-full">

          {/* TopNavbar floating inside glass panel */}
          <TopNavbar visible={navVisible} />

          {/* Scrollable page content — safe-area padding prevents overlap with TopNavbar & BottomNav */}
          <div
            ref={scrollContainerRef}
            className={`flex-1 min-h-0 h-full ${
              isPosPage
                ? 'overflow-hidden pt-[calc(60px+env(safe-area-inset-top,0px))] px-3 lg:px-4 pb-3 flex flex-col'
                : isSettingsPage
                  ? 'overflow-y-auto min-[860px]:overflow-hidden pt-[calc(72px+env(safe-area-inset-top,0px))] lg:pt-[82px] px-3.5 sm:px-6 lg:px-8 pb-[calc(104px+env(safe-area-inset-bottom,0px))] lg:pb-32 flex flex-col'
                  : 'overflow-y-auto pt-[calc(72px+env(safe-area-inset-top,0px))] lg:pt-[82px] px-3.5 sm:px-6 lg:px-8 pb-[calc(104px+env(safe-area-inset-bottom,0px))] lg:pb-32'
            }`}
          >
            <div key={pageKey} className="page-transition-enter flex-1 flex flex-col min-h-0 h-full">
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
