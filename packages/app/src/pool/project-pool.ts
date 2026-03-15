const MAX_SIZE = 4

export type PoolUpdate = {
  keys: readonly string[]
  evicted: string[]
}

export type ProjectPool = {
  activate(key: string | undefined): PoolUpdate
  evict(key: string): PoolUpdate
  getCached(): readonly string[]
  getActive(): string | undefined
}

export function createProjectPool(): ProjectPool {
  const keys: string[] = [] // stable insertion order — drives DOM via Key
  const lru: string[] = [] // LRU order — drives eviction decisions only
  let activeKey: string | undefined

  function touch(key: string): PoolUpdate {
    if (!key) return { keys: [...keys], evicted: [] }

    // Update LRU order (internal, never exposed to reactive layer)
    const li = lru.indexOf(key)
    if (li >= 0) lru.splice(li, 1)
    lru.unshift(key)

    // Add to stable keys only if new (append to end, never reorder)
    if (!keys.includes(key)) keys.push(key)

    // Evict least recently used (from lru tail, skip activeKey and current key)
    const evicted: string[] = []
    while (keys.length > MAX_SIZE) {
      let found: string | undefined
      for (let i = lru.length - 1; i >= 0; i--) {
        if (lru[i] !== activeKey && lru[i] !== key) {
          found = lru[i]
          break
        }
      }
      if (!found) break
      keys.splice(keys.indexOf(found), 1)
      lru.splice(lru.indexOf(found), 1)
      evicted.push(found)
    }
    return { keys: [...keys], evicted }
  }

  function activate(key: string | undefined): PoolUpdate {
    if (!key) {
      activeKey = undefined
      return { keys: [...keys], evicted: [] }
    }
    const out = touch(key)
    activeKey = key
    return out
  }

  function evict(key: string): PoolUpdate {
    const ki = keys.indexOf(key)
    if (ki >= 0) keys.splice(ki, 1)
    const li = lru.indexOf(key)
    if (li >= 0) lru.splice(li, 1)
    if (key === activeKey) activeKey = undefined
    return { keys: [...keys], evicted: ki >= 0 ? [key] : [] }
  }

  return {
    activate,
    evict,
    getCached: () => keys,
    getActive: () => activeKey,
  }
}
