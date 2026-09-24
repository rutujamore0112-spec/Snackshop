import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

export default function HeaderSearch({ query, onQueryChange, resultCount, onShowResults, onRequestProduct }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 60)
    const closeOnOutside = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const showResults = () => {
    setOpen(false)
    onShowResults?.()
  }

  return (
    <div className="header-search-root" ref={rootRef}>
      <motion.button
        type="button"
        className={`header-icon-button header-search-trigger${query ? ' has-query' : ''}`}
        whileTap={{ scale: 0.94 }}
        aria-label={open ? 'Close product search' : 'Search products'}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        {open ? <X size={19} /> : <Search size={19} />}
        {query && !open && <span className="header-search-indicator" aria-hidden="true" />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div className="header-search-popover" role="search" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}>
            <span className="header-search-label">SEARCH THE SHELVES</span>
            <label className="header-search-box">
              <Search size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                aria-label="Search snacks"
                placeholder="Looking for something?"
                onChange={event => onQueryChange(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && query.trim() && resultCount > 0) showResults()
                }}
              />
              {query && <button type="button" onClick={() => onQueryChange('')} aria-label="Clear search"><X size={16} /></button>}
            </label>
            <div className="header-search-status" aria-live="polite">
              {!query && 'Start typing to filter the products.'}
              {query && resultCount > 0 && <button type="button" onClick={showResults}>{resultCount} {resultCount === 1 ? 'snack' : 'snacks'} found</button>}
              {query && resultCount === 0 && <span>No snacks found. <button type="button" onClick={() => { setOpen(false); onRequestProduct?.(query.trim()) }}>Request this snack</button></span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
