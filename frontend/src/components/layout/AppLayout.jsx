import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Auto-collapse sidebar on document editor pages (new or editing) to maximize space
  const isEditorPage = location.pathname.startsWith('/documents/') && location.pathname !== '/documents'

  useEffect(() => {
    // Reset sidebar drawer to closed on route change
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const handleToggle = () => setSidebarOpen(open => !open)
    window.addEventListener('toggle-sidebar', handleToggle)
    return () => window.removeEventListener('toggle-sidebar', handleToggle)
  }, [])

  return (
    <div className="flex h-screen ambient-bg overflow-hidden relative">

      {/* Mobile & Editor desktop overlay */}
      {sidebarOpen && (
        <div
          className={`fixed inset-0 z-20 bg-black/35 backdrop-blur-sm transition-all duration-300 ${
            isEditorPage ? '' : 'lg:hidden'
          }`}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 p-3.5 transform transition-transform duration-300 ease-in-out
        ${isEditorPage ? 'lg:fixed lg:-translate-x-full' : 'lg:relative lg:translate-x-0 lg:flex-shrink-0'}
        lg:p-4 lg:pr-0
        ${sidebarOpen ? 'translate-x-0 lg:translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10 p-3.5 lg:p-4">
        {/* Mobile menu toggle */}
        <div className="lg:hidden flex items-center mb-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 bg-white/60 dark:bg-[#0b101d]/60 border border-white/60 dark:border-white/5 rounded-xl shadow-sm backdrop-blur-xl text-gray-700 dark:text-gray-200 hover:bg-white/80 dark:hover:bg-white/20 transition-all duration-150"
          >
            <Menu size={20} />
          </button>
        </div>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-white/45 dark:bg-white/[0.03] border border-white/60 dark:border-white/10 rounded-[20px] shadow-[inset_0_1.5px_1.5px_rgba(255,255,255,0.3)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
