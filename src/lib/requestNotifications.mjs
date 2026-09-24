import { customerVisibleRequests } from './customerHistory.mjs'

export function requestStatus(request) {
  return request?.status || (request?.resolved ? 'completed' : 'pending')
}

export function hasUnreadRequestUpdate(request) {
  const status = requestStatus(request)
  return ['in_progress', 'completed'].includes(status)
    && request?.customerSeenStatus !== status
}

export function unreadRequestUpdates(requests = [], now = Date.now()) {
  return customerVisibleRequests(requests, now).filter(hasUnreadRequestUpdate)
}
