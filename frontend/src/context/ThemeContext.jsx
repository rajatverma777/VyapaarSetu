import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved ? saved === 'dark' : true // default to dark mode
  })

  useEffect(() => {
    const themeColor = dark ? '#0b0c0e' : '#f5f5f7'
    const scheme = dark ? 'dark' : 'light'

    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }

    document.documentElement.style.backgroundColor = themeColor
    document.documentElement.style.colorScheme = scheme
    if (document.body) {
      document.body.style.backgroundColor = themeColor
      document.body.style.colorScheme = scheme
    }

    // Sync status bar / browser chrome color with the active theme
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
