import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, ShoppingBag, Trash2, Wallet, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { db } from '../lib/firebase'

const TYPES = {
  spent: { label: 'Stock purchase', short: 'Spent' },
  earned: { label: 'Other income', short: 'Income' },
  self: { label: 'Self-use', short: 'Self' },
  refund: { label: 'Supplier refund', short: 'Refund' },
}
const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const asDate = value => {
  if (!value) return new Date(0)
  if (typeof value.toDate === 'function') return value.toDate()
  if (typeof value.toMillis === 'function') return new Date(value.toMillis())
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date(0) : date
}
const itemDate = item => asDate(item.transactionDate || item.createdAt)

function Totals({ entries, orders }) {
  const values = { sales: 0, spent: 0, earned: 0, self: 0, refund: 0 }
  orders.filter(order => order.status === 'paid').forEach(order => { values.sales += Number(order.total || 0) })
  entries.forEach(entry => {
    if (entry.type && TYPES[entry.type]) values[entry.type] += Number(entry.amount || 0)
    else {
      Object.keys(TYPES).forEach(type => { values[type] += Number(entry[type] || 0) })
    }
  })
  values.profit = values.sales - (values.spent - values.refund)
  return <div className="finance-stats">
    {[['Sales from orders', values.sales, 'var(--success)'], ['Stock purchases', values.spent, 'var(--danger)'], ['Supplier refunds', values.refund, 'var(--warning)'], ['Shop profit', values.profit, values.profit >= 0 ? 'var(--accent)' : 'var(--danger)']].map(([label, value, color]) => <div className="finance-stat-box" key={label}><span>{label}</span><strong style={{ color }}>{money(value)}</strong></div>)}
  </div>
}

function EntryForm({ saving, onSave, onClose }) {
  const [draft, setDraft] = useState({ type: 'spent', amount: '', note: '', transactionDate: new Date().toLocaleDateString('en-CA') })
  const submit = event => {
    event.preventDefault()
    const amount = Number(draft.amount)
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('Enter an amount greater than zero')
    if (!draft.note.trim()) return toast.error('Add a short description')
    onSave({ ...draft, amount, note: draft.note.trim() })
  }
  return <motion.form className="finance-entry-form" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} onSubmit={submit}>
    <div className="finance-form-heading"><div><span className="eyebrow">NEW TRANSACTION</span><h3>What changed?</h3></div><button type="button" onClick={onClose} aria-label="Close"><X size={17} /></button></div>
    <div className="finance-entry-fields">
      <label>Type<select value={draft.type} onChange={event => setDraft(value => ({ ...value, type: event.target.value }))}>{Object.entries(TYPES).map(([value, type]) => <option key={value} value={value}>{type.label}</option>)}</select></label>
      <label>Amount (₹)<input type="number" min="0.01" step="0.01" value={draft.amount} onChange={event => setDraft(value => ({ ...value, amount: event.target.value }))} autoFocus /></label>
      <label>Date<input type="date" value={draft.transactionDate} onChange={event => setDraft(value => ({ ...value, transactionDate: event.target.value }))} /></label>
      <label className="finance-note-field">Description<input value={draft.note} onChange={event => setDraft(value => ({ ...value, note: event.target.value }))} placeholder="e.g. Wholesale chips restock" /></label>
    </div>
    <div className="finance-entry-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save transaction'}</button></div>
  </motion.form>
}

export default function Ledger({ orders = [] }) {
  const [entries, setEntries] = useState([])
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => onSnapshot(query(collection(db, 'ledger'), orderBy('createdAt', 'desc')), snap => setEntries(snap.docs.map(entry => ({ id: entry.id, ...entry.data() }))), err => console.error('Ledger error:', err)), [])

  const activity = useMemo(() => [
    ...orders.filter(order => order.status === 'paid').map(order => ({ ...order, kind: 'sale' })),
    ...entries.map(entry => ({ ...entry, kind: 'ledger' })),
  ].sort((a, b) => itemDate(b) - itemDate(a)), [entries, orders])
  const visible = activity.filter(item => {
    const type = item.kind === 'sale' ? 'sale' : item.type || 'legacy'
    const haystack = [item.customerName, item.note, ...(item.items || []).map(product => product.name)].filter(Boolean).join(' ').toLowerCase()
    return (filter === 'all' || filter === type) && haystack.includes(search.trim().toLowerCase())
  })

  const save = async transaction => {
    setSaving(true)
    try {
      await addDoc(collection(db, 'ledger'), { ...transaction, createdAt: serverTimestamp() })
      toast.success('Transaction saved')
      setShowForm(false)
    } catch (error) { toast.error(`Failed: ${error.message}`) }
    finally { setSaving(false) }
  }
  const remove = async id => {
    if (!confirm('Delete this finance entry?')) return
    try { await deleteDoc(doc(db, 'ledger', id)); toast.success('Entry deleted') }
    catch (error) { toast.error(`Delete failed: ${error.message}`) }
  }

  return <div className="finance-ledger">
    <div className="finance-overview-heading"><div><span className="eyebrow">MONEY IN, MONEY OUT</span><h2>Know what the shop is making.</h2><p>Paid orders become sales automatically. Add purchases, refunds, income, and self-use here.</p></div><button className="finance-add-button" onClick={() => setShowForm(value => !value)}><Plus size={15} /> Add transaction</button></div>
    <Totals entries={entries} orders={orders} />
    <AnimatePresence>{showForm && <EntryForm saving={saving} onSave={save} onClose={() => setShowForm(false)} />}</AnimatePresence>
    <div className="finance-section-heading"><div><h3>Activity</h3><p>{visible.length} of {activity.length} records</p></div><label className="finance-search"><Search size={15} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search finance activity" /></label></div>
    <div className="finance-filters">{[['all', 'All'], ['sale', 'Sales'], ['spent', 'Spent'], ['earned', 'Other income'], ['self', 'Self-use'], ['refund', 'Refunds']].map(([value, label]) => <button key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <div className="finance-activity-list">
      {visible.length === 0 ? <div className="finance-empty"><Wallet size={24} /><strong>No matching activity</strong><p>Try another filter or add a transaction.</p></div> : visible.map(item => {
        const sale = item.kind === 'sale'
        const amount = sale ? item.total : item.amount || item.spent || item.earned || item.self || item.refund
        const positive = sale || item.type === 'earned' || item.type === 'refund'
        return <motion.div layout className="finance-activity-row" key={`${item.kind}-${item.id}`}>
          <span className="finance-activity-icon">{sale ? <ShoppingBag size={16} /> : <Wallet size={16} />}</span>
          <div className="finance-activity-copy"><strong>{sale ? item.customerName || 'Customer order' : item.note || 'Ledger entry'}</strong><p>{sale ? (item.items || []).map(product => `${product.name} ×${product.qty}`).join(', ') : TYPES[item.type]?.label || 'Older entry'}</p><time>{itemDate(item).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</time></div>
          <div className="finance-activity-values"><strong className={positive ? 'is-positive' : 'is-negative'}>{positive ? '+' : '−'}{money(amount)}</strong>{!sale && <button onClick={() => remove(item.id)}><Trash2 size={14} /><span>Delete</span></button>}</div>
        </motion.div>
      })}
    </div>
  </div>
}
