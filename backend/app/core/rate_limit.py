import logging
import time
from collections import defaultdict
from typing import Dict, List
from fastapi import HTTPException, Request, status

from app.core.config import settings

logger = logging.getLogger("app.security.rate_limit")


class InMemoryRateLimiter:
    """
    Lightweight in-memory sliding-window rate limiter for sensitive authentication routes.
    Protects login and password reset routes against brute-force / credential-stuffing attacks
    without requiring external dependencies.
    """

    def __init__(self, requests_limit: int = 20, window_seconds: int = 60):
        self.requests_limit = requests_limit
        self.window_seconds = window_seconds
        self._history: Dict[str, List[float]] = defaultdict(list)

    def _get_client_identifier(self, request: Request) -> str:
        # Check X-Forwarded-For if behind a proxy / load balancer
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()
            if client_ip:
                return client_ip
        if request.client and request.client.host:
            return request.client.host
        return "unknown"

    def check(self, request: Request, identifier_suffix: str = "") -> None:
        """
        Check rate limit for client IP. Raises HTTP 429 if the request limit is exceeded.
        """
        if not getattr(settings, "RATE_LIMIT_ENABLED", True):
            return

        client_ip = self._get_client_identifier(request)
        key = f"{client_ip}:{identifier_suffix}" if identifier_suffix else client_ip
        now = time.time()
        window_start = now - self.window_seconds

        # Prune expired timestamps
        active_timestamps = [t for t in self._history[key] if t > window_start]

        if len(active_timestamps) >= self.requests_limit:
            self._history[key] = active_timestamps
            logger.warning(f"Rate limit exceeded for client: {client_ip}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait a moment before trying again.",
                headers={"Retry-After": str(int(self.window_seconds))},
            )

        active_timestamps.append(now)
        self._history[key] = active_timestamps

    def reset(self) -> None:
        """Clear limiter memory (useful for tests)."""
        self._history.clear()


# Global limiter for login/auth attempts (20 attempts per 60 seconds per IP)
auth_rate_limiter = InMemoryRateLimiter(requests_limit=20, window_seconds=60)
