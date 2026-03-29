import time
from collections import defaultdict

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimiter:
    def __init__(self, requests_limit: int, window_seconds: int):
        self.requests_limit = requests_limit
        self.window_seconds = window_seconds
        self.requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, ip: str) -> bool:
        now = time.time()
        # 移除已過期的請求紀錄
        if ip in self.requests:
            self.requests[ip] = [t for t in self.requests[ip] if now - t < self.window_seconds]
            # 如果該 IP 已無請求，則移除該 key (防止 memory leak)
            if not self.requests[ip]:
                del self.requests[ip]

        # 簡單的清理機制：每 1000 次請求清理一次所有過期 key
        # (生產環境可改為背景排程或 lazy cleanup)
        if len(self.requests) > 1000:
             self.cleanup_old_entries(now)

        current_requests = self.requests.get(ip, [])
        if len(current_requests) < self.requests_limit:
            self.requests[ip].append(now)
            return True
        return False

    def cleanup_old_entries(self, now: float):
        """清除所有 IP 的過期紀錄"""
        keys_to_delete = []
        for ip, timestamps in self.requests.items():
            valid_timestamps = [t for t in timestamps if now - t < self.window_seconds]
            if not valid_timestamps:
                keys_to_delete.append(ip)
            else:
                self.requests[ip] = valid_timestamps

        for ip in keys_to_delete:
            del self.requests[ip]

# 定義不同場景的限制器
api_limiter = RateLimiter(requests_limit=500, window_seconds=60)      # API: 每分鐘 500 次
auth_limiter = RateLimiter(requests_limit=10, window_seconds=900)     # 登入: 每 15 分鐘 10 次

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 取得客戶端 IP
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        # 針對登入介面使用更嚴格的限制
        if path == "/api/auth/login" or path == "/api/auth/token":
            if not auth_limiter.is_allowed(client_ip):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many login attempts, please try again later"
                )

        # 針對所有 /api 路徑使用通用限制
        if path.startswith("/api"):
            if not api_limiter.is_allowed(client_ip):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests, please try again later"
                )

        response = await call_next(request)
        return response
