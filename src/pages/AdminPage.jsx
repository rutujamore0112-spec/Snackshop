import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit2, Trash2, Check, X, LogOut, Package, MessageSquare, ShoppingBag, ImageIcon, Upload, Link, ChevronDown, ChevronUp, Clock, Loader, CheckCircle, Wallet, Store, DoorClosed, Eye, EyeOff, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, orderBy, query, writeBatch, getDoc, setDoc, serverTimestamp
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { signOut, onAuthStateChanged } from 'firebase/auth'
import { motion, AnimatePresence } from 'framer-motion'
import { db, auth, storage } from '../lib/firebase'
import Ledger from '../components/Ledger'
import { updateOrderStatus } from '../lib/orders'
import { isExpiredDraft } from '../lib/orderLifecycle.mjs'
import ThemeToggle from '../components/ThemeToggle'
import useThemePreference from '../lib/useThemePreference'

const CATEGORIES = ['chips', 'biscuits', 'sweets', 'namkeen', 'drinks', 'noodles']

const ADMIN_EMAIL = 'rutujamore0112@gmail.com'

// Order statuses that still hold a live `reserved` quantity on a product.
// Anything outside this set (paid / cancelled) has already been settled,
// so there's nothing left to release.
const ACTIVE_RESERVING_STATUSES = ['pending', 'utr_submitted', 'draft']

export const REQUEST_STATUSES = {
  pending:     { label: 'Pending',     color: 'var(--warning)',  dim: 'var(--warning-dim)',  icon: Clock },
  in_progress: { label: 'In Progress', color: 'var(--accent)',   dim: 'var(--accent-dim)',   icon: Loader },
  completed:   { label: 'Completed',   color: 'var(--success)',  dim: 'var(--success-dim)',  icon: CheckCircle },
}

function StatCard({ label, value, color, maskable = false }) {
  const [revealed, setRevealed] = useState(false)
  const hidden = maskable && !revealed
  return (
    <motion.div 
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 300 }}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', position: 'relative' }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 26, color: color || 'var(--accent)', filter: hidden ? 'blur(8px)' : 'none', userSelect: hidden ? 'none' : 'auto' }}>{hidden ? '••••••' : value}</div>
      {maskable && <button onClick={() => setRevealed(value => !value)} title={revealed ? 'Hide revenue' : 'Show revenue'} aria-label={revealed ? 'Hide revenue' : 'Show revenue'} style={{ position: 'absolute', top: 11, right: 11, width: 30, height: 30, display: 'grid', placeItems: 'center', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text-secondary)' }}>{revealed ? <EyeOff size={14} /> : <Eye size={14} />}</button>}
    </motion.div>
  )
}

function NoImagePlaceholder({ small = false }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <span style={{ fontSize: small ? 9 : 12, fontFamily: 'Syne', fontWeight: 700, color: 'rgba(255,255,255,0.13)', transform: 'rotate(-35deg)', letterSpacing: '0.06em', userSelect: 'none', whiteSpace: 'nowrap' }}>
        NO IMAGE
      </span>
    </div>
  )
}

function ImageUploader({ currentUrl, onUploaded, productId }) {
  const [uploading, setUploading] = useState(false)
  const [mode, setMode] = useState('file')
  const [urlInput, setUrlInput] = useState('')
  const inputRef = useRef()

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return }
    setUploading(true)
    try {
      const storageRef = ref(storage, `products/${productId || Date.now()}_${file.name}`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      onUploaded(url)
      toast.success('Image uploaded!')
    } catch {
      const localUrl = URL.createObjectURL(file)
      onUploaded(localUrl)
      toast('Storage not enabled — image set temporarily', { icon: 'i' })
    }
    setUploading(false)
  }

  const handleUrlSave = () => {
    if (!urlInput.trim()) { toast.error('Enter an image URL'); return }
    onUploaded(urlInput.trim())
    setUrlInput('')
    setMode('file')
    toast.success('Image URL saved!')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      <motion.div
        whileHover={{ scale: mode === 'file' ? 1.02 : 1 }}
        onClick={() => mode === 'file' && inputRef.current.click()}
        style={{ width: 72, height: 72, borderRadius: 10, border: `2px dashed ${currentUrl ? 'var(--success)' : 'var(--border-hover)'}`, background: 'var(--surface2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: mode === 'file' ? 'pointer' : 'default', overflow: 'hidden', flexShrink: 0 }}
      >
        {uploading ? (
          <div style={{ fontSize: 10, color: 'var(--text-hint)', textAlign: 'center', padding: 4 }}>Uploading...</div>
        ) : currentUrl ? (
          <img src={currentUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
        ) : (
          <>
            <ImageIcon size={20} color="var(--text-hint)" />
            <div style={{ fontSize: 9, color: 'var(--text-hint)', marginTop: 3 }}>Click to upload</div>
          </>
        )}
      </motion.div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => inputRef.current.click()} style={{ flex: 1, padding: '4px 6px', background: mode === 'file' ? 'var(--accent-dim)' : 'var(--surface2)', border: `1px solid ${mode === 'file' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, color: mode === 'file' ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer' }}>
          <Upload size={9} /> Upload
        </button>
        <button onClick={() => setMode(m => m === 'url' ? 'file' : 'url')} style={{ flex: 1, padding: '4px 6px', background: mode === 'url' ? 'var(--accent-dim)' : 'var(--surface2)', border: `1px solid ${mode === 'url' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, color: mode === 'url' ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer' }}>
          <Link size={9} /> URL
        </button>
      </div>
      {mode === 'url' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ display: 'flex', gap: 4, marginTop: 2 }}>
          <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="Paste image URL..." style={{ fontSize: 11, padding: '5px 8px', flex: 1 }} onKeyDown={e => e.key === 'Enter' && handleUrlSave()} />
          <button onClick={handleUrlSave} style={{ padding: '5px 8px', background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 6, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer' }}>OK</button>
        </motion.div>
      )}
    </div>
  )
}

function groupByMonth(orders) {
  const groups = {}
  for (const order of orders) {
    let label = 'Unknown'
    try {
      const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt)
      label = date.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    } catch {}
    if (!groups[label]) groups[label] = []
    groups[label].push(order)
  }
  return groups
}

function MonthGroup({ label, orders, processing, onMarkPaid, onReject, onDelete, onDeleteAll }) {
  const [collapsed, setCollapsed] = useState(false)
  const paidTotal = orders.filter(o => o.status === 'paid').reduce((s, o) => s + (o.total || 0), 0)
  const pendingCount = orders.filter(o => ACTIVE_RESERVING_STATUSES.includes(o.status)).length

  return (
    <div style={{ marginBottom: 20 }}>
      <div 
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <motion.div animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={15} color="var(--text-secondary)" />
          </motion.div>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>{label}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
          {pendingCount > 0 && (
            <span style={{ background: 'var(--warning)', color: 'white', borderRadius: 100, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{pendingCount} pending</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>₹{paidTotal} collected</span>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={e => { e.stopPropagation(); onDeleteAll(orders) }}
            style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 6, padding: '4px 10px', color: 'var(--danger)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
            title={`Delete all ${label} orders`}
          >
            <Trash2 size={11} /> Delete all
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}
          >
            {orders.map(o => {
              const needsAction = ACTIVE_RESERVING_STATUSES.includes(o.status)
              const isProcessing = processing[o.id]
              return (
                <motion.div 
                  key={o.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  style={{ background: 'var(--surface)', border: `1px solid ${needsAction ? 'rgba(135,206,235,0.4)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '14px 16px', position: 'relative' }}
                >
                  {needsAction && (
                    <div style={{ position: 'absolute', top: -9, left: 14, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 100, fontFamily: 'Syne' }}>
                      VERIFY PAYMENT
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{o.customerName}</div>
                      
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, fontStyle: o.status === 'paid' ? 'normal' : 'italic' }}>
                        {(o.items || []).map(item => `${item.name} x${item.qty}`).join(', ')}
                      </div>

                      {o.utr && (
                        <div style={{ fontSize: 11, background: 'var(--surface2)', borderRadius: 6, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'monospace', color: 'var(--text-secondary)', marginBottom: 4 }}>
                          UTR: <strong style={{ color: 'var(--accent)' }}>{o.utr}</strong>
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>
                        {o.createdAt?.toDate?.()?.toLocaleString('en-IN') || '—'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18 }}>₹{o.total}</div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100, background: o.status === 'paid' ? 'var(--success-dim)' : o.status === 'cancelled' ? 'var(--danger-dim)' : o.status === 'utr_submitted' ? 'var(--accent-dim)' : 'var(--warning-dim)', color: o.status === 'paid' ? 'var(--success)' : o.status === 'cancelled' ? 'var(--danger)' : o.status === 'utr_submitted' ? 'var(--accent)' : 'var(--warning)' }}>
                        {o.status === 'draft' ? 'Awaiting payment' : o.status === 'utr_submitted' ? 'pending verify' : o.status}
                      </span>
                      {o.status === 'cancelled' && o.cancelledBy && (
                        <span style={{ fontSize: 10, color: 'var(--text-hint)' }}>
                          by {o.cancelledBy === 'customer' ? 'customer' : 'you'}
                        </span>
                      )}
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onDelete(o.id)}
                        style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 6, padding: '3px 8px', color: 'var(--danger)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                        title="Delete this order"
                      >
                        <Trash2 size={10} /> Delete
                      </motion.button>
                    </div>
                  </div>

                  {needsAction && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onMarkPaid(o)}
                        disabled={isProcessing || o.status === 'draft'}
                        style={{ flex: 1, padding: 10, background: isProcessing ? 'var(--surface2)' : 'var(--success)', border: 'none', borderRadius: 8, color: isProcessing ? 'var(--text-secondary)' : 'white', fontFamily: 'Syne', fontWeight: 700, fontSize: 13, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                      >
                        {isProcessing
                          ? 'Processing...'
                          : o.status === 'draft'
                            ? 'Awaiting payment'
                            : o.paymentMethod === 'cash'
                            ? 'Accept Cash — deduct stock'
                            : 'Mark as Paid — deduct stock'}
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onReject(o)}
                        disabled={isProcessing}
                        style={{ padding: '10px 16px', background: 'var(--danger-dim)', border: 'none', borderRadius: 8, color: 'var(--danger)', fontSize: 13, fontWeight: 600, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                      >
                        Reject
                      </motion.button>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RequestStatusBadge({ status }) {
  const cfg = REQUEST_STATUSES[status] || REQUEST_STATUSES.pending
  const Icon = cfg.icon
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700, background: cfg.dim, color: cfg.color, whiteSpace: 'nowrap' }}>
      <Icon size={10} />
      {cfg.label}
    </span>
  )
}

function RequestMonthGroup({ label, requests, onSetStatus, onDelete, onDeleteAll }) {
  const [collapsed, setCollapsed] = useState(false)
  const pendingCount = requests.filter(r => !r.resolved).length

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <motion.div animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={15} color="var(--text-secondary)" />
          </motion.div>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>{label}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{requests.length} request{requests.length !== 1 ? 's' : ''}</span>
          {pendingCount > 0 && (
            <span style={{ background: 'var(--warning)', color: 'white', borderRadius: 100, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{pendingCount} open</span>
          )}
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={e => { e.stopPropagation(); onDeleteAll(requests) }}
          style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 6, padding: '4px 10px', color: 'var(--danger)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          title={`Delete all ${label} requests`}
        >
          <Trash2 size={11} /> Delete all
        </motion.button>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}
          >
            {requests.map(r => {
              const status = r.status || (r.resolved ? 'completed' : 'pending')
              const nextStatus = status === 'pending' ? 'in_progress' : status === 'in_progress' ? 'completed' : null

              return (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: status === 'completed' ? 0.6 : 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  style={{
                    background: 'var(--surface)',
                    border: `1px solid ${status === 'pending' ? 'rgba(135,206,235,0.2)' : status === 'in_progress' ? 'rgba(135,206,235,0.2)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{r.customerName}</span>
                        <RequestStatusBadge status={status} />
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>{r.message}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{r.createdAt?.toDate?.()?.toLocaleString('en-IN') || '—'}</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      {nextStatus && (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => onSetStatus(r.id, nextStatus)}
                          style={{
                            background: REQUEST_STATUSES[nextStatus].dim,
                            border: 'none',
                            borderRadius: 8,
                            padding: '6px 12px',
                            color: REQUEST_STATUSES[nextStatus].color,
                            fontSize: 12,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            whiteSpace: 'nowrap',
                            cursor: 'pointer'
                          }}
                        >
                          {nextStatus === 'in_progress' ? <><Loader size={11} /> Mark In Progress</> : <><CheckCircle size={11} /> Mark Completed</>}
                        </motion.button>
                      )}

                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onDelete(r.id)}
                        style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 8, padding: '5px 10px', color: 'var(--danger)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                        title="Delete request"
                      >
                        <Trash2 size={11} /> Delete
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function AdminPage() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useThemePreference()
  const [tab, setTab] = useState('products')
  const [productSearch, setProductSearch] = useState('')
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [requests, setRequests] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [adding, setAdding] = useState(false)
  const [processing, setProcessing] = useState({})
  const [deletingAll, setDeletingAll] = useState(false)
  const [deletingAllRequests, setDeletingAllRequests] = useState(false)
  const [newProduct, setNewProduct] = useState({ name: '', category: 'chips', price: '', stock: '', imageUrl: '' })
  const [shopOpen, setShopOpen] = useState(true)
  const [togglingShop, setTogglingShop] = useState(false)

  const isInitialOrdersLoad = useRef(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (!user) {
        navigate('/admin')
        return
      }

      if (user.email?.toLowerCase() !== ADMIN_EMAIL) {
        navigate('/')
      }
    })

    const pUnsub = onSnapshot(collection(db, 'products'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (b.stock || 0) - (a.stock || 0) || (a.name || '').localeCompare(b.name || ''))
      setProducts(data)
    }, err => console.error('Products error:', err))

    const oUnsub = onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
      snap => {
        if (!isInitialOrdersLoad.current) {
          snap.docChanges().forEach(change => {
            const data = change.doc.data()
            if (change.type === 'added' && ACTIVE_RESERVING_STATUSES.includes(data.status)) {
              toast(`New order from ${data.customerName}`)
            }
            if (change.type === 'modified' && (data.status === 'utr_submitted' || data.status === 'pending')) {
              toast(`Payment submitted by ${data.customerName}`)
            }
          })
        }
        isInitialOrdersLoad.current = false
        const allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setOrders(allOrders)
      },
      err => { console.error('Orders error:', err); toast.error('Could not load orders. Check your connection and Firebase permissions.') }
    )

    const rUnsub = onSnapshot(
      query(collection(db, 'requests'), orderBy('createdAt', 'desc')),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('Requests error:', err)
    )

    const sUnsub = onSnapshot(doc(db, 'settings', 'shopStatus'), snap => {
      setShopOpen(snap.exists() ? snap.data().open !== false : true)
    }, err => console.error('Shop status error:', err))

    return () => { unsub(); pUnsub(); oUnsub(); rUnsub(); sUnsub() }
  }, [])

  useEffect(() => {
    const expireDrafts = () => {
      orders.filter(order => isExpiredDraft(order)).forEach(order => {
        updateOrderStatus(order.id, 'expire').catch(err => console.error('Order expiry:', err))
      })
    }
    expireDrafts()
    const timer = setInterval(expireDrafts, 5000)
    return () => clearInterval(timer)
  }, [orders])

  const toggleShopStatus = async () => {
    setTogglingShop(true)
    try {
      await setDoc(doc(db, 'settings', 'shopStatus'), { open: !shopOpen }, { merge: true })
      toast.success(!shopOpen ? 'Shop marked as open' : 'Shop marked as closed')
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
    setTogglingShop(false)
  }

  const totalRevenue = orders.filter(o => o.status === 'paid').reduce((s, o) => s + (o.total || 0), 0)
  const pendingPayments = orders.filter(o => o.status === 'utr_submitted').length
  const needsActionCount = orders.filter(o => ACTIVE_RESERVING_STATUSES.includes(o.status)).length
  const pendingReqs = requests.filter(r => !r.resolved).length
  const monthGroups = groupByMonth(orders)
  const requestMonthGroups = groupByMonth(requests)

  useEffect(() => {
    const baseIcon = (badge) => `
      <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
        <rect width='100' height='100' rx='20' fill='#000000'/>
        <text y='75' x='50' text-anchor='middle' font-size='70' font-weight='900' fill='#87CEEB' font-family='Arial'>S</text>
        ${badge}
      </svg>
    `.trim()

    const badgeMarkup = needsActionCount > 0 ? `
      <circle cx='78' cy='24' r='${needsActionCount > 9 ? 26 : 22}' fill='#ff5c5c' stroke='#000000' stroke-width='4'/>
      <text x='78' y='${needsActionCount > 9 ? '33' : '32'}' text-anchor='middle' font-size='${needsActionCount > 9 ? '30' : '34'}' font-weight='900' fill='#ffffff' font-family='Arial'>${needsActionCount > 99 ? '99+' : needsActionCount}</text>
    ` : ''

    const svg = baseIcon(badgeMarkup)
    const href = `data:image/svg+xml,${encodeURIComponent(svg)}`

    let link = document.querySelector("link[rel='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = href

    document.title = needsActionCount > 0
      ? `(${needsActionCount}) SnackShop Admin`
      : 'SnackShop Admin'
  }, [needsActionCount])

  const handleLogout = async () => {
    await signOut(auth)
    navigate('/')
  }

  const markAsPaid = async (order) => {
    if (processing[order.id]) return
    setProcessing(p => ({ ...p, [order.id]: true }))
    try {
      await updateOrderStatus(order.id, 'paid')
      toast.success(`Confirmed for ${order.customerName} — stock updated`)
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
    setProcessing(p => ({ ...p, [order.id]: false }))
  }

  const markAsCancelled = async (order) => {
    if (processing[order.id]) return
    setProcessing(p => ({ ...p, [order.id]: true }))
    try {
      await updateOrderStatus(order.id, 'cancelled', 'admin')
      toast('Order rejected')
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
    setProcessing(p => ({ ...p, [order.id]: false }))
  }

  // ── NEW: shared helper ──────────────────────────────────────────
  // Releases any `reserved` stock an order is still holding, IF that
  // order is still in an active/unsettled state (pending, utr_submitted,
  // or draft). Paid/cancelled orders already had their reservation
  // settled, so this is a no-op for them. This must run BEFORE the
  // order doc is deleted — once deleted, there's no way to know what
  // to release.
  const deleteOrders = async (selected) => {
    for (const order of selected) await updateOrderStatus(order.id, 'delete')
  }

  const deleteOrder = async (id) => {
    if (!confirm('Delete this order permanently?')) return
    try {
      await updateOrderStatus(id, 'delete')
      toast.success('Order deleted')
    } catch (err) { toast.error('Could not delete order: ' + err.message) }
  }

  const deleteMonthOrders = async (monthOrders) => {
    if (!confirm('Delete all ' + monthOrders.length + ' orders in this month? This cannot be undone.')) return
    try {
      await deleteOrders(monthOrders)
      toast.success(monthOrders.length + ' orders deleted')
    } catch (err) { toast.error('Deletion stopped: ' + err.message) }
  }

  const deleteAllOrders = async () => {
    if (!confirm('DELETE ALL ' + orders.length + ' ORDERS PERMANENTLY? This cannot be undone.')) return
    if (!confirm('Are you absolutely sure? All order history will be lost.')) return
    setDeletingAll(true)
    try {
      await deleteOrders(orders)
      toast.success('All orders deleted')
    } catch (err) { toast.error('Deletion stopped: ' + err.message) }
    setDeletingAll(false)
  }

  const saveEdit = async (id) => {
    try {
      await updateDoc(doc(db, 'products', id), {
        name: editData.name,
        category: editData.category,
        price: Number(editData.price),
        stock: Number(editData.stock),
        stockMax: Number(editData.stockMax || editData.stock),
        imageUrl: editData.imageUrl || '',
      })
      toast.success('Product updated')
      setEditingId(null)
    } catch (err) {
      toast.error(`Save failed: ${err.message}`)
    }
  }

  const deleteProduct = async (id) => {
    if (!confirm('Delete this product?')) return
    await deleteDoc(doc(db, 'products', id))
    toast.success('Deleted')
  }

  const addProduct = async () => {
    if (!newProduct.name || !newProduct.price || !newProduct.stock) { toast.error('Fill name, price and stock'); return }
    try {
      await addDoc(collection(db, 'products'), {
        name: newProduct.name.trim(),
        category: newProduct.category,
        price: Number(newProduct.price),
        stock: Number(newProduct.stock),
        stockMax: Number(newProduct.stock),
        reserved: 0,
        imageUrl: newProduct.imageUrl || '',
      })
      toast.success('Product added!')
      setAdding(false)
      setNewProduct({ name: '', category: 'chips', price: '', stock: '', imageUrl: '' })
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
  }

  const restockProduct = async (id) => {
    const val = prompt('Set new stock quantity:')
    if (val === null || isNaN(Number(val))) return
    await updateDoc(doc(db, 'products', id), { stock: Number(val), stockMax: Number(val) })
    toast.success('Stock updated')
  }

  const setRequestStatus = async (id, newStatus) => {
    try {
      await updateDoc(doc(db, 'requests', id), {
        status: newStatus,
        resolved: newStatus === 'completed',
        ...(newStatus === 'completed' ? { completedAt: serverTimestamp() } : {}),
      })
      toast.success(`Request marked as ${REQUEST_STATUSES[newStatus]?.label}`)
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
  }

  const deleteRequest = async (id) => {
    if (!confirm('Delete this request permanently?')) return
    await deleteDoc(doc(db, 'requests', id))
    toast.success('Request deleted')
  }

  const deleteAllRequests = async () => {
    if (!confirm(`Delete ALL ${requests.length} requests permanently? This cannot be undone.`)) return
    setDeletingAllRequests(true)
    try {
      const batch = writeBatch(db)
      requests.forEach(r => batch.delete(doc(db, 'requests', r.id)))
      await batch.commit()
      toast.success('All requests deleted')
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    }
    setDeletingAllRequests(false)
  }

  const deleteMonthRequests = async (monthRequests) => {
    if (!confirm(`Delete all ${monthRequests.length} requests in this month? This cannot be undone.`)) return
    const batch = writeBatch(db)
    monthRequests.forEach(r => batch.delete(doc(db, 'requests', r.id)))
    await batch.commit()
    toast.success(`${monthRequests.length} requests deleted`)
  }

  const tabs = [
    { id: 'products', label: 'Products', icon: Package },
    { id: 'orders', label: 'Orders', icon: ShoppingBag },
    { id: 'requests', label: 'Requests', icon: MessageSquare },
    { id: 'finance', label: 'Finance', icon: Wallet },
  ]

  const normalizedProductSearch = productSearch.trim().toLowerCase()
  const filteredProducts = normalizedProductSearch
    ? products.filter(product => [product.name, product.category].filter(Boolean).join(' ').toLowerCase().includes(normalizedProductSearch))
    : products

  return (
    <div className="admin-shell" data-theme={theme} style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <style>{`
        @keyframes badgePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,159,67,0.55); }
          50% { box-shadow: 0 0 0 5px rgba(255,159,67,0); }
        }
        .admin-tab-badge {
          animation: badgePulse 1.6s ease-in-out infinite;
        }
        .no-spinner::-webkit-outer-spin-button,
        .no-spinner::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinner {
          -moz-appearance: textfield;
        }
      `}</style>
      <header className="admin-header" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 30 }}>
        <div className="admin-header-inner" style={{ maxWidth: 960, margin: '0 auto', padding: '0 16px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="admin-brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18 }}>SnackShop</span>
            <span style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 100, fontWeight: 600 }}>ADMIN</span>
          </div>
          <div className="admin-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleShopStatus}
              disabled={togglingShop}
              style={{
                background: shopOpen ? 'var(--success-dim)' : 'var(--danger-dim)',
                border: `1px solid ${shopOpen ? 'rgba(46,204,113,0.3)' : 'rgba(255,92,92,0.3)'}`,
                borderRadius: 100, padding: '6px 14px',
                color: shopOpen ? 'var(--success)' : 'var(--danger)',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
                cursor: togglingShop ? 'not-allowed' : 'pointer', opacity: togglingShop ? 0.6 : 1,
              }}
              title="Toggle whether the shop shows as open for pickup"
            >
              {shopOpen ? <Store size={13} /> : <DoorClosed size={13} />}
              <span className="admin-shop-label">{shopOpen ? 'Shop Open' : 'Shop Closed'}</span>
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleLogout} 
              style={{ background: 'var(--danger-dim)', border: '1px solid rgba(255,92,92,0.2)', borderRadius: 8, padding: '6px 12px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}
            >
              <LogOut size={13} /> <span className="admin-logout-label">Logout</span>
            </motion.button>
          </div>
        </div>
      </header>

      <div className="admin-main" style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        {/* Stats Grid */}
        <div className="admin-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
          <StatCard label="Total products" value={products.length} />
          <StatCard label="Paid orders" value={orders.filter(o => o.status === 'paid').length} color="var(--success)" />
          <StatCard label="Revenue" value={`₹${totalRevenue}`} color="var(--accent)" maskable />
          <StatCard label="Awaiting verify" value={pendingPayments} color={pendingPayments > 0 ? 'var(--warning)' : 'var(--text-secondary)'} />
        </div>

        {/* Dynamic Animated Tabs */}
        <div className="admin-tabs" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {tabs.map(t => (
            <button 
              key={t.id} 
              onClick={() => setTab(t.id)} 
              style={{ 
                position: 'relative', 
                padding: '8px 18px', 
                borderRadius: 100, 
                fontSize: 13, 
                fontFamily: 'Syne', 
                fontWeight: 600, 
                background: 'transparent', 
                color: tab === t.id ? 'var(--accent-text)' : 'var(--text-secondary)', 
                border: 'none', 
                display: 'flex', 
                alignItems: 'center', 
                gap: 6, 
                cursor: 'pointer',
                zIndex: 1 
              }}
            >
              {tab === t.id && (
                <motion.div
                  layoutId="activeTabPill"
                  style={{ position: 'absolute', inset: 0, background: 'var(--accent)', borderRadius: 100, zIndex: -1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <t.icon size={13} /> {t.label}
              {t.id === 'orders' && needsActionCount > 0 && (
                <span className="admin-tab-badge" style={{ background: 'var(--warning)', color: 'white', borderRadius: 100, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                  {needsActionCount}
                </span>
              )}
              {t.id === 'requests' && pendingReqs > 0 && (
                <span className="admin-tab-badge" style={{ background: 'var(--danger)', color: 'white', borderRadius: 100, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                  {pendingReqs}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── PRODUCTS TAB ── */}
        {tab === 'products' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{filteredProducts.length === products.length ? products.length : `${filteredProducts.length} of ${products.length}`} product{products.length !== 1 ? 's' : ''} in inventory</p>
                <label className="admin-product-search"><Search size={16} /><input type="search" value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Search products" aria-label="Search products" />{productSearch && <button type="button" onClick={() => setProductSearch('')} aria-label="Clear product search"><X size={15} /></button>}</label>
              </div>
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setAdding(a => !a)} 
                style={{ padding: '9px 18px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 10, fontFamily: 'Syne', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <Plus size={14} /> Add product
              </motion.button>
            </div>

            <AnimatePresence>
              {adding && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16, overflow: 'hidden' }}
                >
                  <p style={{ fontFamily: 'Syne', fontWeight: 700, marginBottom: 14, fontSize: 14, color: 'var(--accent)' }}>New product</p>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <ImageUploader currentUrl={newProduct.imageUrl} productId={`new_${Date.now()}`} onUploaded={url => setNewProduct(p => ({ ...p, imageUrl: url }))} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, flex: 1, minWidth: 260 }}>
                      <input value={newProduct.name} onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))} placeholder="Product name *" />
                      <select value={newProduct.category} onChange={e => setNewProduct(p => ({ ...p, category: e.target.value }))}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input type="number" className="no-spinner" value={newProduct.price} onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))} placeholder="Price ₹ *" />
                      <input type="number" className="no-spinner" value={newProduct.stock} onChange={e => setNewProduct(p => ({ ...p, stock: e.target.value }))} placeholder="Stock qty *" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <motion.button whileTap={{ scale: 0.95 }} onClick={addProduct} style={{ padding: '9px 22px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 8, fontFamily: 'Syne', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                      <Check size={13} /> Save product
                    </motion.button>
                    <button onClick={() => setAdding(false)} style={{ padding: '9px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              {products.length === 0 && (
                <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-hint)', fontSize: 14 }}>
                  No products yet — click "Add product" to get started
                </div>
              )}
              {products.length > 0 && filteredProducts.length === 0 && <div className="admin-search-empty"><Search size={23} /><p>No products match “{productSearch.trim()}”</p><button onClick={() => setProductSearch('')}>Clear search</button></div>}
              <AnimatePresence>
                {filteredProducts.map((p, i) => (
                  <motion.div 
                    key={p.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ padding: '12px 16px', borderBottom: i < filteredProducts.length - 1 ? '1px solid var(--border)' : 'none' }}
                  >
                    {editingId === p.id ? (
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <ImageUploader currentUrl={editData.imageUrl} productId={p.id} onUploaded={url => setEditData(d => ({ ...d, imageUrl: url }))} />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, flex: 1 }}>
                          <input value={editData.name || ''} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} style={{ fontSize: 13 }} placeholder="Name" />
                          <select value={editData.category || 'chips'} onChange={e => setEditData(d => ({ ...d, category: e.target.value }))}>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input type="number" className="no-spinner" value={editData.price || ''} onChange={e => setEditData(d => ({ ...d, price: e.target.value }))} placeholder="₹" />
                          <input type="number" className="no-spinner" value={editData.stock || ''} onChange={e => setEditData(d => ({ ...d, stock: e.target.value }))} placeholder="Stock" />
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button onClick={() => saveEdit(p.id)} style={{ background: 'var(--success)', border: 'none', borderRadius: 8, padding: '8px 16px', color: 'white', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><Check size={13} /> Save</button>
                          <button onClick={() => setEditingId(null)} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 6, padding: '8px 10px', color: 'var(--text-secondary)', display: 'flex', cursor: 'pointer' }}><X size={14} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="admin-product-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} /> : <NoImagePlaceholder small />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-hint)', textTransform: 'capitalize' }}>{p.category}</div>
                        </div>
                        <div className="admin-product-price" style={{ fontFamily: 'Syne', fontWeight: 700, color: 'var(--accent)', minWidth: 50, textAlign: 'right' }}>₹{p.price}</div>
                        <span className="admin-product-stock stock-availability-badge" style={{ padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 600, minWidth: 64, textAlign: 'center', color: p.stock === 0 ? 'var(--danger)' : p.stock <= 4 ? 'var(--warning)' : 'var(--success)' }}>
                          {p.stock} left
                        </span>
                        <div className="admin-product-actions" style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => restockProduct(p.id)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Restock</button>
                          <button onClick={() => { setEditingId(p.id); setEditData({ ...p }) }} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 6, padding: 6, color: 'var(--text-secondary)', display: 'flex', cursor: 'pointer' }}><Edit2 size={13} /></button>
                          <button onClick={() => deleteProduct(p.id)} style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 6, padding: 6, color: 'var(--danger)', display: 'flex', cursor: 'pointer' }}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* ── ORDERS TAB ── */}
        {tab === 'orders' && (
          <div>
            {orders.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-hint)', fontSize: 14, background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>No orders yet</div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={deleteAllOrders}
                    disabled={deletingAll}
                    style={{ padding: '8px 16px', background: 'var(--danger-dim)', border: '1px solid rgba(255,92,92,0.25)', borderRadius: 8, color: 'var(--danger)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: deletingAll ? 'not-allowed' : 'pointer', opacity: deletingAll ? 0.6 : 1 }}
                  >
                    <Trash2 size={13} /> {deletingAll ? 'Deleting...' : `Delete all orders (${orders.length})`}
                  </motion.button>
                </div>
                {Object.entries(monthGroups).map(([label, monthOrders]) => (
                  <MonthGroup
                    key={label}
                    label={label}
                    orders={monthOrders}
                    processing={processing}
                    onMarkPaid={markAsPaid}
                    onReject={markAsCancelled}
                    onDelete={deleteOrder}
                    onDeleteAll={deleteMonthOrders}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* ── REQUESTS TAB ── */}
        {tab === 'requests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {requests.length} request{requests.length !== 1 ? 's' : ''} · {pendingReqs} open
                </p>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={deleteAllRequests}
                  disabled={deletingAllRequests}
                  style={{ padding: '7px 14px', background: 'var(--danger-dim)', border: '1px solid rgba(255,92,92,0.25)', borderRadius: 8, color: 'var(--danger)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', opacity: deletingAllRequests ? 0.6 : 1 }}
                >
                  <Trash2 size={12} /> {deletingAllRequests ? 'Deleting…' : `Delete all (${requests.length})`}
                </motion.button>
              </div>
            )}

            {requests.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-hint)', fontSize: 14, background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>No requests yet</div>
            )}

            {Object.entries(requestMonthGroups).map(([label, monthRequests]) => (
              <RequestMonthGroup
                key={label}
                label={label}
                requests={monthRequests}
                onSetStatus={setRequestStatus}
                onDelete={deleteRequest}
                onDeleteAll={deleteMonthRequests}
              />
            ))}
          </div>
        )}

        {/* ── FINANCE TAB ── */}
        {tab === 'finance' && <Ledger orders={orders} />}
      </div>
    </div>
  )
}
