import { useEffect, useState } from 'react'
import { CheckCircle, Clock, Loader, MessageSquare, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../lib/AuthContext'
import { hasUnreadRequestUpdate, requestStatus } from '../lib/requestNotifications.mjs'
import { customerVisibleRequests } from '../lib/customerHistory.mjs'

const REQUEST_STATUSES = {
  pending: { label: 'Pending', Icon: Clock, hint: 'We received your request and will review it soon.' },
  in_progress: { label: 'In progress', Icon: Loader, hint: 'Rutuja is working on sourcing this item.' },
  completed: { label: 'Added to stock', Icon: CheckCircle, hint: 'Your requested item has been added. Check the shop.' },
}

function RequestCard({ request }) {
  const status = requestStatus(request)
  const config = REQUEST_STATUSES[status] || REQUEST_STATUSES.pending
  const { Icon } = config
  const unread = hasUnreadRequestUpdate(request)

  return (
    <article className={`profile-request-card is-${status}${unread ? ' has-update' : ''}`}>
      <div className="profile-request-card-heading">
        <p>{request.message}</p>
        <span className="profile-request-status"><Icon size={12} />{config.label}</span>
      </div>
      <p className="profile-request-hint">{config.hint}</p>
      <div className="profile-request-meta">
        <time>{request.createdAt?.toDate?.()?.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) || 'Pending timestamp'}</time>
        {unread && <span>New update</span>}
      </div>
    </article>
  )
}

export default function RequestForm({ historyOnly = false, showHistory = true, embedded = false, initialMessage = '' }) {
  const { user, profile } = useAuth()
  const [message, setMessage] = useState(initialMessage)
  const [sending, setSending] = useState(false)
  const [requests, setRequests] = useState([])
  const [historyError, setHistoryError] = useState('')
  const [historyNow, setHistoryNow] = useState(() => Date.now())

  useEffect(() => {
    if (initialMessage) setMessage(initialMessage)
  }, [initialMessage])

  useEffect(() => {
    if (!user?.uid || (!historyOnly && !showHistory)) return undefined
    const requestsQuery = query(
      collection(db, 'requests'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
    )
    setHistoryError('')
    return onSnapshot(requestsQuery, snapshot => {
      setRequests(snapshot.docs.map(item => ({ id: item.id, ...item.data() })))
    }, error => {
      console.error('Requests listener:', error)
      setHistoryError('Could not load your requests. Please refresh and try again.')
    })
  }, [historyOnly, showHistory, user?.uid])

  useEffect(() => {
    if (!historyOnly && !showHistory) return undefined
    const timer = setInterval(() => setHistoryNow(Date.now()), 60 * 1000)
    return () => clearInterval(timer)
  }, [historyOnly, showHistory])

  const handleSend = async () => {
    const cleanMessage = message.trim()
    if (!cleanMessage) {
      toast.error('Write your request first')
      return
    }
    setSending(true)
    try {
      await addDoc(collection(db, 'requests'), {
        userId: user.uid,
        customerName: profile?.name || user?.displayName || user?.email?.split('@')[0] || 'Customer',
        message: cleanMessage,
        status: 'pending',
        resolved: false,
        createdAt: serverTimestamp(),
        customerSeenStatus: 'pending',
        customerSeenAt: serverTimestamp(),
      })
      toast.success('Request sent')
      setMessage('')
    } catch (error) {
      toast.error(`Could not send request: ${error.message}`)
    } finally {
      setSending(false)
    }
  }

  const visibleRequests = customerVisibleRequests(requests, historyNow)

  if (historyOnly) {
    return (
      <div className="profile-history-list">
        {historyError && <p role="alert" className="profile-history-empty">{historyError}</p>}
        {!historyError && visibleRequests.length === 0 && <p className="profile-history-empty">No requests from the last 72 hours.</p>}
        {visibleRequests.map(request => <RequestCard key={request.id} request={request} />)}
      </div>
    )
  }

  return (
    <div className={embedded ? 'embedded-request-form' : 'request-section-wrapper'}>
      {!embedded && <div className="request-section-heading"><MessageSquare size={16} /><div><strong>Request a snack</strong><span>Tell Rutuja what you would like to see in stock.</span></div></div>}
      <div className="request-compose-card">
        <textarea
          value={message}
          maxLength={499}
          rows={4}
          placeholder="Which snack should we add? Include the flavour and pack size if possible."
          onChange={event => setMessage(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) handleSend()
          }}
        />
        <div className="request-compose-footer">
          <span>{message.length}/499</span>
          <button type="button" onClick={handleSend} disabled={sending || !message.trim()}><Send size={14} />{sending ? 'Sending' : 'Send request'}</button>
        </div>
      </div>
      {showHistory && <div className="profile-history-list standalone-history">{visibleRequests.map(request => <RequestCard key={request.id} request={request} />)}</div>}
    </div>
  )
}
