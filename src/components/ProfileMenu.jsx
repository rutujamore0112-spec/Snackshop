import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronDown, LogOut, Package, Send, UserRound } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import ThemeToggle from './ThemeToggle'

const SECTIONS = [
  { id: 'new-request', label: 'New request', hint: "Can't find something? Let us know", Icon: Send },
  { id: 'orders', label: 'Old orders', hint: 'Orders from the last 24 hours', Icon: Package },
  { id: 'requests', label: 'Old requests', hint: 'Requests from the last 72 hours', Icon: Bell },
]

export default function ProfileMenu({
  displayName,
  email,
  photoURL,
  theme,
  onToggleTheme,
  onLogout,
  requestFormContent,
  ordersContent,
  requestsContent,
  requestUpdateCount = 0,
  onRequestHistoryOpen,
  openRequestSignal = 0,
}) {
  const [open, setOpen] = useState(false)
  const [activeSection, setActiveSection] = useState(null)
  const rootRef = useRef(null)
  const firstName = displayName?.trim().split(/\s+/)[0] || 'Customer'
  const initial = firstName.charAt(0).toUpperCase()

  useEffect(() => {
    if (!open) return undefined
    const closeOnOutside = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  useEffect(() => {
    if (!openRequestSignal) return
    setOpen(true)
    setActiveSection('new-request')
  }, [openRequestSignal])

  useEffect(() => {
    if (open && activeSection === 'requests' && requestUpdateCount > 0) onRequestHistoryOpen?.()
  }, [activeSection, onRequestHistoryOpen, open, requestUpdateCount])

  const toggleSection = section => {
    setActiveSection(current => current === section ? null : section)
  }

  const sectionContent = {
    'new-request': requestFormContent,
    orders: ordersContent,
    requests: requestsContent,
  }

  return (
    <div className="profile-menu-root" ref={rootRef}>
      <motion.button
        type="button"
        className="profile-trigger"
        whileTap={{ scale: 0.96 }}
        aria-label={requestUpdateCount ? `Open profile, ${requestUpdateCount} unread request updates` : 'Open profile'}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <span className="profile-avatar" aria-hidden="true">
          {photoURL ? <img src={photoURL} alt="" referrerPolicy="no-referrer" /> : initial}
        </span>
        {requestUpdateCount > 0 && <span className="profile-update-badge" aria-hidden="true">{requestUpdateCount > 9 ? '9+' : requestUpdateCount}</span>}
        <span className="profile-trigger-name">{firstName}</span>
        <motion.span className="profile-chevron" animate={{ rotate: open ? 180 : 0 }}><ChevronDown size={15} /></motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div className="profile-popover" role="dialog" aria-label="Your profile" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}>
            <div className="profile-popover-heading">
              <span className="profile-avatar large" aria-hidden="true">
                {photoURL ? <img src={photoURL} alt="" referrerPolicy="no-referrer" /> : initial}
              </span>
              <div><strong>{displayName || firstName}</strong><span>{email || 'Your SnackShop account'}</span></div>
            </div>

            <div className="profile-sections">
              {SECTIONS.map(({ id, label, hint, Icon }) => (
                <div className="profile-section" key={id}>
                  <button type="button" aria-expanded={activeSection === id} onClick={() => toggleSection(id)}>
                    <Icon size={16} />
                    <span><strong>{label}{id === 'requests' && requestUpdateCount > 0 && <em>{requestUpdateCount} new</em>}</strong><small>{hint}</small></span>
                    <motion.span animate={{ rotate: activeSection === id ? 180 : 0 }}><ChevronDown size={15} /></motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {activeSection === id && <motion.div className="profile-section-panel" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>{sectionContent[id]}</motion.div>}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            <div className="profile-appearance">
              <span><UserRound size={15} /> Appearance</span>
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
            <button type="button" className="profile-logout" onClick={() => { setOpen(false); onLogout?.() }}><LogOut size={17} /> Logout</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
