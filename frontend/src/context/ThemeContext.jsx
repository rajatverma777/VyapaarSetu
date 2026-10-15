import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved ? saved === 'dark' : true // default to dark mode
  })

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }

    // Sync status bar / browser chrome color with the active theme.
    // This makes the area behind the notch/status bar on mobile match the app background,
    // which is the key to the "Google-style" true edge-to-edge look.
    const themeColor = dark ? '#0b0c0e' : '#f5f5f7'
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
      m.setAttribute('content', themeColor)
    })
  }, [dark])

  const toggle = () => {
    setDark(prev => !prev)
  }

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
