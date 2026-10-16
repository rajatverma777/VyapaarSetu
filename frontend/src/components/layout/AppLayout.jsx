import { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import TopNavbar from './TopNavbar'
import BottomNav from './BottomNav'
import CommandPalette from '../ui/CommandPalette'
import { healthAPI } from '../../services/api'

export default function AppLayout() {
  const location = useLocation()
  const [navVisible, setNavVisible] = useState(true)
  const layoutRef = useRef(null)
  const progressRef = useRef(0)
  const lastScrollY = useRef(0)
  const lastDeltaRef = useRef(0)
  const idleTimerRef = useRef(null)

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

  // Apply progress directly to CSS variables on layoutRef
  // animate=false during active scroll for 1:1 direct speed tracking
  // animate=true when settling into place after scroll stops
  const applyNavProgress = (val, animate = false) => {
    const layout = layoutRef.current
    if (!layout) return
    const p = Math.min(1, Math.max(0, Math.round(val * 1000) / 1000))
    progressRef.current = p
    layout.style.setProperty('--nav-progress', String(p))

    if (animate) {
      layout.style.setProperty(
        '--nav-transition',
        'transform 260ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease'
      )
    } else {
      layout.style.setProperty('--nav-transition', 'none')
    }

    if (p >= 0.85) {
      layout.setAttribute('data-nav-hidden', 'true')
    } else {
      layout.removeAttribute('data-nav-hidden')
    }
  }

  // Page-transition key & reset nav visibility on navigation
  const [pageKey, setPageKey] = useState(location.pathname)
  useEffect(() => {
    setPageKey(location.pathname)
    setNavVisible(true)
    progressRef.current = 0
    lastScrollY.current = 0
    lastDeltaRef.current = 0
    applyNavProgress(0, false)
  }, [location.pathname])

  // Direct 1:1 Scroll Speed Tracking:
  // With whatever speed user scrolls up or down, the navigation bars move at that exact speed!
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    // Travel range (pixels of scroll) for full navbar reveal/hide
    // 70px gives exact 1:1 finger tracking speed on mobile and desktop
    const TRAVEL_RANGE = 70

    // Reset initial scroll position
    lastScrollY.current = container.scrollTop
    applyNavProgress(0, false)

    let rafId = null

    const handleScroll = () => {
      if (rafId !== null) return

      rafId = window.requestAnimationFrame(() => {
        rafId = null
        const currentY = container.scrollTop
        const delta = currentY - lastScrollY.current
        lastScrollY.current = currentY

        // Ignore 0 delta
        if (delta === 0) return

        // Overscroll protection on iOS / mobile Safari
        if (currentY <= 0) {
          applyNavProgress(0, false)
          return
        }
        const maxScroll = container.scrollHeight - container.clientHeight
        if (maxScroll > 0 && currentY >= maxScroll) {
          if (delta > 0) return
        }

        // Keep navbars visible if a dropdown or bottom sheet is open
        const isMenuOpen = document.querySelector('.brand-nav-dropdown') ||
                           document.querySelector('.bnav-sheet--open')
        if (isMenuOpen) {
          applyNavProgress(0, false)
          return
        }

        // At the very top: always lock to fully visible
        if (currentY <= 15) {
          applyNavProgress(0, false)
          return
        }

        lastDeltaRef.current = delta

        // Directly increment/decrement progress proportional to scroll delta:
        // Scroll down (delta > 0) -> progress increases towards 1 (hides at speed of scroll)
        // Scroll up (delta < 0) -> progress decreases towards 0 (shows at speed of scroll)
        // Fast swipe = huge delta = fast hide/show!
        // Slow drag = tiny delta = slow hide/show!
        const currentProgress = progressRef.current
        const nextProgress = Math.min(1, Math.max(0, currentProgress + delta / TRAVEL_RANGE))

        // Update immediately with NO transition lag during active scroll
        applyNavProgress(nextProgress, false)

        // When scrolling stops (user stops dragging / momentum ends),
        // gently snap to fully open or fully closed
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        idleTimerRef.current = setTimeout(() => {
          const p = progressRef.current
          const lastDelta = lastDeltaRef.current
          if (container.scrollTop <= 20) {
            applyNavProgress(0, true)
          } else if (lastDelta > 0 && p > 0.35) {
            applyNavProgress(1, true)
          } else if (lastDelta < 0 && p < 0.70) {
            applyNavProgress(0, true)
          }
        }, 110)
      })
    }

    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      container.removeEventListener('scroll', handleScroll)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [location.pathname])

  return (
    <div ref={layoutRef} className="flex flex-1 min-h-0 ambient-bg overflow-hidden relative w-full">

      {/* ── MAIN CONTENT (fills #root which is position:fixed inset:0 — true edge-to-edge) ── */}
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
