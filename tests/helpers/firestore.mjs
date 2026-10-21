import assert from 'node:assert/strict'
import { Timestamp } from 'firebase-admin/firestore'

const at = value => Timestamp.fromDate(new Date(value))
const createdAt = at('2026-10-01T12:00:00+05:30')

// In-memory transaction fixture: apply SDK increments/server timestamps only
// at commit, and support a query-to-transaction race without touching live data.
export function database(initial, { beforeTransaction, retry = false } = {}) {
  const data = new Map(Object.entries(initial)), times = new Map()
  let hook = beforeTransaction
  const ref = (collection, id) => ({ id, path: `${collection}/${id}`, parent: { id: collection } })
  const snapshot = reference => ({ ref: reference, id: reference.id, exists: data.has(reference.path),
    data: () => data.get(reference.path), updateTime: times.get(reference.path) || createdAt })
  function merge(previous, patch) {
    const next = { ...previous }
    for (const [key, value] of Object.entries(patch)) {
      if (value?.constructor.name === 'NumericIncrementTransform') next[key] = (next[key] || 0) + value.operand
      else if (value?.constructor.name === 'ServerTimestampTransform') next[key] = at('2026-10-14T20:00:00+05:30')
      else if (value && value.constructor === Object) next[key] = merge(next[key] || {}, value)
      else next[key] = value
    }
    return next
  }
  const db = {
    data, times,
    collection(name) {
      let status, limit = Infinity, cursor = ''
      const query = {
        doc: id => ref(name, id),
        where(field, operator, value) { assert.equal(field, 'status'); assert.equal(operator, '=='); status = value; return query },
        orderBy() { return query },
        limit(count) { limit = count; return query },
        startAfter(id) { cursor = id; return query },
        async get() {
          const docs = [...data.entries()].filter(([path, item]) => path.startsWith(`${name}/`) && item.status === status && path.split('/')[1] > cursor)
            .sort(([a], [b]) => a.localeCompare(b)).slice(0, limit).map(([path]) => snapshot(ref(name, path.split('/')[1])))
          return { docs, size: docs.length, empty: !docs.length }
        },
      }
      return query
    },
    async runTransaction(operation) {
      hook?.(db); hook = null
      async function attempt(commit) {
        const writes = []
        const tx = {
          get: async reference => snapshot(reference),
          getAll: async (...references) => references.map(snapshot),
          set: (reference, patch, options) => writes.push(['set', reference, patch, options]),
          update: (reference, patch) => writes.push(['update', reference, patch]),
          delete: reference => writes.push(['delete', reference]),
        }
        const result = await operation(tx)
        if (commit) for (const [method, reference, patch, options] of writes) {
          if (method === 'delete') data.delete(reference.path)
          else data.set(reference.path, merge(method === 'update' || options?.merge ? data.get(reference.path) || {} : {}, patch))
        }
        return result
      }
      if (retry) await attempt(false)
      return attempt(true)
    },
  }
  return db
}

