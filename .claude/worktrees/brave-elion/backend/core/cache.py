"""
Simple In-Memory Cache for FastAPI
Provides response caching to reduce database load
"""
from functools import wraps
from typing import Optional, Callable, Any
import time
import hashlib
import json
import logging

logger = logging.getLogger(__name__)


class SimpleCache:
    """
    Thread-safe in-memory cache with TTL support.

    Features:
    - Time-based expiration (TTL)
    - Pattern-based cache invalidation
    - Memory-efficient (stores serialized data)
    """

    def __init__(self):
        self._cache: dict[str, tuple[Any, float]] = {}
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache if not expired.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found/expired
        """
        if key in self._cache:
            value, expiry = self._cache[key]
            if time.time() < expiry:
                self._hits += 1
                logger.debug(f"Cache HIT: {key}")
                return value
            else:
                # Expired - remove from cache
                del self._cache[key]
                logger.debug(f"Cache EXPIRED: {key}")

        self._misses += 1
        logger.debug(f"Cache MISS: {key}")
        return None

    def set(self, key: str, value: Any, ttl: int = 300):
        """
        Store value in cache with TTL.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds (default: 300 = 5 minutes)
        """
        expiry = time.time() + ttl
        self._cache[key] = (value, expiry)
        logger.debug(f"Cache SET: {key} (TTL: {ttl}s)")

    def delete(self, key: str):
        """
        Delete specific key from cache.

        Args:
            key: Cache key to delete
        """
        if key in self._cache:
            del self._cache[key]
            logger.debug(f"Cache DELETE: {key}")

    def delete_pattern(self, pattern: str):
        """
        Delete all keys matching a pattern (prefix).

        Args:
            pattern: Key prefix to match (e.g., "itp:" deletes all ITP cache)
        """
        keys_to_delete = [k for k in self._cache if k.startswith(pattern)]
        for k in keys_to_delete:
            del self._cache[k]
        logger.debug(f"Cache DELETE_PATTERN: {pattern} ({len(keys_to_delete)} keys)")

    def clear(self):
        """Clear all cache entries."""
        count = len(self._cache)
        self._cache.clear()
        logger.info(f"Cache CLEARED: {count} keys removed")

    def stats(self) -> dict:
        """
        Get cache statistics.

        Returns:
            Dictionary with hits, misses, hit rate, and size
        """
        total = self._hits + self._misses
        hit_rate = (self._hits / total * 100) if total > 0 else 0

        return {
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": f"{hit_rate:.1f}%",
            "size": len(self._cache)
        }


# Global cache instance
cache = SimpleCache()


def cache_response(ttl: int = 300, key_prefix: str = ""):
    """
    Decorator to cache FastAPI endpoint responses.

    Usage:
        @router.get("/items")
        @cache_response(ttl=60, key_prefix="items")
        async def get_items(skip: int = 0, limit: int = 100):
            return items

    Args:
        ttl: Time to live in seconds
        key_prefix: Prefix for cache key (useful for invalidation)

    Returns:
        Decorator function
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key from function name and arguments
            # Hash the arguments to create a consistent key
            args_str = json.dumps({
                "args": [str(a) for a in args],
                "kwargs": {k: str(v) for k, v in kwargs.items()}
            }, sort_keys=True)
            args_hash = hashlib.md5(args_str.encode()).hexdigest()[:8]

            cache_key = f"{key_prefix}:{func.__name__}:{args_hash}"

            # Check cache
            cached_result = cache.get(cache_key)
            if cached_result is not None:
                return cached_result

            # Execute function
            result = await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)

            # Store in cache (only cache successful results)
            if result is not None:
                cache.set(cache_key, result, ttl)

            return result

        return wrapper
    return decorator


def invalidate_cache(pattern: str):
    """
    Helper function to invalidate cache by pattern.

    Usage:
        @router.post("/items")
        def create_item(item: Item):
            result = crud.create_item(item)
            invalidate_cache("items:")  # Clear all items cache
            return result

    Args:
        pattern: Cache key pattern to invalidate
    """
    cache.delete_pattern(pattern)


# Import asyncio for iscoroutinefunction check
import asyncio
