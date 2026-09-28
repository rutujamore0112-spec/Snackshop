export const TRANSACTION_TYPES = {
  procurement: 'Procurement cost',
  refund: 'Supplier refund',
  cashback: 'Cashback',
  self: 'Self use',
  spent: 'Stock purchase',
  earned: 'Other income',
}

export function financeDate(value) {
  if (typeof value?.toDate === 'function') return value.toDate()
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`)
  const date = new Date(value || 0)
  return Number.isNaN(date.getTime()) ? new Date(0) : date
}

export function financeMonth(item) {
  const date = financeDate(item.transactionDate || item.paidAt || item.createdAt)
  return date.getTime() ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : ''
}

export function financeTotals(entries, orders) {
  const totals = { sales: 0, procurement: 0, earned: 0, refund: 0, cashback: 0, self: 0 }
  for (const order of orders) if (order.status === 'paid') totals.sales += Number(order.total || 0)
  for (const entry of entries) {
    if (entry.type) {
      const type = entry.type === 'spent' ? 'procurement' : entry.type
      if (type in totals) totals[type] += Number(entry.amount || 0)
    } else {
      totals.procurement += Number(entry.spent || 0)
      totals.earned += Number(entry.earned || 0)
      totals.self += Number(entry.self || 0)
      totals.refund += Number(entry.refund || 0)
      totals.cashback += Number(entry.cashback || 0)
    }
  }
  totals.profit = totals.sales - totals.procurement + totals.refund + totals.cashback
  return totals
}

export function financeDateBounds(now = new Date()) {
  return {
    min: `${now.getFullYear() - 1}-01-01`,
    max: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  }
}
