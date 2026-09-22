import logging
import re
import sys
from typing import Any

# Sensitive keys and patterns to redact from logs
SENSITIVE_PATTERNS = [
    re.compile(r"(password['\"]?\s*[:=]\s*['\"])([^'\"]+)(['\"])", re.IGNORECASE),
    re.compile(r"(token['\"]?\s*[:=]\s*['\"])([^'\"]+)(['\"])", re.IGNORECASE),
    re.compile(r"(secret['\"]?\s*[:=]\s*['\"])([^'\"]+)(['\"])", re.IGNORECASE),
    re.compile(r"(authorization['\"]?\s*[:=]\s*['\"])([^'\"]+)(['\"])", re.IGNORECASE),
    re.compile(r"(api_key['\"]?\s*[:=]\s*['\"])([^'\"]+)(['\"])", re.IGNORECASE),
    re.compile(r"(bearer\s+)([a-zA-Z0-9_\-\.]+)(\b|$)", re.IGNORECASE),
]


class SensitiveDataFilter(logging.Filter):
    """
    Filter to mask sensitive information (passwords, tokens, secrets)
    from log records before output.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self.mask_sensitive(record.msg)

        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: self.mask_sensitive(v) for k, v in record.args.items()}
            elif isinstance(record.args, tuple):
                record.args = tuple(self.mask_sensitive(arg) for arg in record.args)

        return True

    @staticmethod
    def mask_sensitive(value: Any) -> Any:
        if not isinstance(value, str):
            return value

        masked = value
        for pattern in SENSITIVE_PATTERNS:
            masked = pattern.sub(r"\1***REDACTED***\3", masked)
        return masked


def setup_logging(level: int = logging.INFO) -> None:
    """
    Configures stream-only logging (stdout). Never writes to local disk (ephemeral filesystem).
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Remove existing handlers to avoid duplicates
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setLevel(level)
    stream_handler.addFilter(SensitiveDataFilter())

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    stream_handler.setFormatter(formatter)
    root_logger.addHandler(stream_handler)
