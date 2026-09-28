import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, ShoppingBag, Trash2, Wallet, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { db } from '../lib/firebase'
import { TRANSACTION_TYPES, financeMonth, financeTotals, financeDateBounds } from '../lib/finance.mjs'

const TYPES = {
  procurement: { label: 'Procurement cost', short: 'Procurement' },
  earned: { label: 'Other income', short: 'Income' },
  self: { label: 'Self-use', short: 'Self' },
  refund: { label: 'Supplier refund', short: 'Refund' },
  cashback: { label: 'Cashback', short: 'Cashback' },
  spent: { label: 'Stock purchase', short: 'Spent' },
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
const itemDate = item => asDate(item.transactionDate || item.paidAt || item.createdAt)

function Totals({ entries, orders }) {
  const values = financeTotals(entries, orders)
  return <div className="finance-stats">
    {[['Sales from orders', values.sales, 'var(--success)'], ['Procurement', values.procurement, 'var(--danger)'], ['Supplier refunds', values.refund, 'var(--warning)'], ['Cashback', values.cashback, 'var(--success)'], ['Self use', values.self, 'var(--text-secondary)'], ['Shop profit', values.profit, values.profit >= 0 ? 'var(--accent)' : 'var(--danger)']].map(([label, value, color]) => <div className="finance-stat-box" key={label}><span>{label}</span><strong style={{ color }}>{money(value)}</strong></div>)}
  </div>
}

function EntryForm({ saving, onSave, onClose }) {
  const bounds = financeDateBounds()
  const [draft, setDraft] = useState({ type: 'procurement', amount: '', note: '', transactionDate: bounds.max })
  const submit = event => {
    event.preventDefault()
    const amount = Number(draft.amount)
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('Enter an amount greater than zero')
    if (draft.transactionDate < bounds.min || draft.transactionDate > bounds.max) return toast.error('Choose a date from the last year through today')
    onSave({ ...draft, amount, note: draft.note.trim() })
  }
  return <motion.form className="finance-entry-form" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} onSubmit={submit}>
    <div className="finance-form-heading"><div><span className="eyebrow">NEW TRANSACTION</span><h3>What changed?</h3></div><button type="button" onClick={onClose} aria-label="Close"><X size={17} /></button></div>
    <div className="finance-entry-fields">
      <label>Type<select value={draft.type} onChange={event => setDraft(value => ({ ...value, type: event.target.value }))}>{Object.entries(TRANSACTION_TYPES).filter(([value]) => value !== 'spent' && value !== 'earned').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Amount (₹)<input type="number" min="0.01" step="0.01" value={draft.amount} onChange={event => setDraft(value => ({ ...value, amount: event.target.value }))} autoFocus /></label>
      <label>Date<input type="date" min={bounds.min} max={bounds.max} value={draft.transactionDate} onChange={event => setDraft(value => ({ ...value, transactionDate: event.target.value }))} /></label>
      <label className="finance-note-field">Description (optional)<input value={draft.note} maxLength={120} onChange={event => setDraft(value => ({ ...value, note: event.target.value }))} placeholder="e.g. Wholesale chips restock" /></label>
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
  const [period, setPeriod] = useState(financeDateBounds().max.slice(0, 7))

  useEffect(() => onSnapshot(query(collection(db, 'ledger'), orderBy('createdAt', 'desc')), snap => setEntries(snap.docs.map(entry => ({ id: entry.id, ...entry.data() }))), err => console.error('Ledger error:', err)), [])

  const monthOptions = useMemo(() => [...new Set([financeDateBounds().max.slice(0, 7), ...entries.map(financeMonth), ...orders.map(financeMonth)].filter(Boolean))].sort().reverse(), [entries, orders])
  const selectedEntries = useMemo(() => period === 'all' ? entries : entries.filter(entry => financeMonth(entry) === period), [entries, period])
  const selectedOrders = useMemo(() => period === 'all' ? orders : orders.filter(order => financeMonth(order) === period), [orders, period])
  const activity = useMemo(() => [
    ...selectedOrders.filter(order => order.status === 'paid').map(order => ({ ...order, kind: 'sale' })),
    ...selectedEntries.map(entry => ({ ...entry, kind: 'ledger' })),
  ].sort((a, b) => itemDate(b) - itemDate(a)), [selectedEntries, selectedOrders])
  const totals = useMemo(() => financeTotals(selectedEntries, selectedOrders), [selectedEntries, selectedOrders])
  const dailyFlow = useMemo(() => {
    const days = new Map()
    const add = (item, field, amount) => {
      const date = itemDate(item)
      if (!date.getTime()) return
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const day = days.get(key) || { key, sales: 0, procurement: 0 }
      day[field] += amount
      days.set(key, day)
    }
    selectedOrders.filter(order => order.status === 'paid').forEach(order => add(order, 'sales', Number(order.total || 0)))
    selectedEntries.filter(entry => ['procurement', 'spent'].includes(entry.type) || (!entry.type && entry.spent)).forEach(entry => add(entry, 'procurement', Number(entry.amount || entry.spent || 0)))
    return [...days.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-10)
  }, [selectedEntries, selectedOrders])
  const dailyCeiling = Math.max(1, ...dailyFlow.flatMap(day => [day.sales, day.procurement]))
  const visible = activity.filter(item => {
    const type = item.kind === 'sale' ? 'sale' : item.type === 'spent' ? 'procurement' : item.type || 'legacy'
    const haystack = [item.customerName, item.note, ...(item.items || []).map(product => product.name)].filter(Boolean).join(' ').toLowerCase()
    return (filter === 'all' || filter === type) && haystack.includes(search.trim().toLowerCase())
  })

  const save = async transaction => {
    setSaving(true)
    try {
      await addDoc(collection(db, 'ledger'), { ...transaction, createdAt: serverTimestamp() })
      toast.success('Transaction saved')
      setShowForm(false)
      setPeriod(transaction.transactionDate.slice(0, 7))
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
    <div className="finance-period-picker"><label htmlFor="finance-month">Period</label><select id="finance-month" value={period} onChange={event => setPeriod(event.target.value)}><option value="all">All time</option>{monthOptions.map(month => <option key={month} value={month}>{new Date(`${month}-01T12:00:00`).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</option>)}</select></div>
    <Totals entries={selectedEntries} orders={selectedOrders} />
    <div className="finance-charts">
      <section className="finance-chart-panel"><h3>Daily sales and procurement</h3>{dailyFlow.length ? <div className="finance-daily-chart">{dailyFlow.map(day => <div key={day.key} className="finance-daily-day" title={`${day.key} · Sales ${money(day.sales)} · Procurement ${money(day.procurement)}`}><div className="finance-daily-bars"><i style={{ height: `${day.sales / dailyCeiling * 100}%`, background: 'var(--success)' }} /><i style={{ height: `${day.procurement / dailyCeiling * 100}%`, background: 'var(--danger)' }} /></div><small>{day.key.slice(8)}</small></div>)}</div> : <p>No data for this period.</p>}<div className="finance-chart-legend"><span style={{ color: 'var(--success)' }}>● Sales</span><span style={{ color: 'var(--danger)' }}>● Procurement</span></div></section>
      <section className="finance-chart-panel"><h3>Transaction mix</h3>{[['Procurement', totals.procurement], ['Refunds', totals.refund], ['Cashback', totals.cashback], ['Self use', totals.self]].map(([label, value]) => <div className="finance-mix-row" key={label}><span>{label}</span><strong>{money(value)}</strong></div>)}</section>
    </div>
    <AnimatePresence>{showForm && <EntryForm saving={saving} onSave={save} onClose={() => setShowForm(false)} />}</AnimatePresence>
    <div className="finance-section-heading"><div><h3>Activity</h3><p>{visible.length} of {activity.length} records</p></div><label className="finance-search"><Search size={15} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search finance activity" /></label></div>
    <div className="finance-filters">{[['all', 'All'], ['sale', 'Sales'], ['procurement', 'Procurement'], ['refund', 'Refunds'], ['cashback', 'Cashback'], ['self', 'Self use'], ['earned', 'Other income']].map(([value, label]) => <button key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <div className="finance-activity-list">
      {visible.length === 0 ? <div className="finance-empty"><Wallet size={24} /><strong>No matching activity</strong><p>Try another filter or add a transaction.</p></div> : visible.map(item => {
        const sale = item.kind === 'sale'
        const amount = sale ? item.total : item.amount || item.spent || item.earned || item.self || item.refund || item.cashback
        const positive = sale || ['earned', 'refund', 'cashback'].includes(item.type)
        return <motion.div layout className="finance-activity-row" key={`${item.kind}-${item.id}`}>
          <span className="finance-activity-icon">{sale ? <ShoppingBag size={16} /> : <Wallet size={16} />}</span>
          <div className="finance-activity-copy"><strong>{sale ? item.customerName || 'Customer order' : item.note || 'Ledger entry'}</strong><p>{sale ? (item.items || []).map(product => `${product.name} ×${product.qty}`).join(', ') : TYPES[item.type]?.label || 'Older entry'}</p><time>{itemDate(item).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</time></div>
          <div className="finance-activity-values"><strong className={positive ? 'is-positive' : 'is-negative'}>{positive ? '+' : '−'}{money(amount)}</strong>{!sale && <button onClick={() => remove(item.id)}><Trash2 size={14} /><span>Delete</span></button>}</div>
        </motion.div>
      })}
    </div>
  </div>
}
