---
name: optimize-query
description: Add caching to repeated database or vector queries
trigger: when asked to optimize, speed up, or cache queries
---

## Steps
1. Identify the query function and how often it's called with the same args
2. Add @functools.lru_cache(maxsize=128) for pure functions
3. For async functions, use a dict-based cache with TTL:
   _cache = {}; if key in _cache and not expired: return _cache[key]
4. Set TTL based on data freshness needs (default: 300 seconds)
5. Add cache invalidation in the corresponding write function
6. Verify: call function twice with same args, second call should be faster
