import { motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'

export default function ThemeToggle({ theme, onToggle }) {
  const dark = theme === 'dark'
  return (
    <motion.button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      whileTap={{ scale: 0.96 }}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      title={`Switch to ${dark ? 'light' : 'dark'} mode`}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <motion.span className="theme-toggle-thumb" animate={{ x: dark ? 17 : 0 }} transition={{ type: 'spring', stiffness: 520, damping: 34 }}>
          {dark ? <Moon size={10} /> : <Sun size={10} />}
        </motion.span>
      </span>
      <span className="theme-toggle-label">{dark ? 'Light' : 'Dark'}</span>
    </motion.button>
  )
}
