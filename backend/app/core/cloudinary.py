import asyncio
from typing import Any, Dict, List, Optional
import cloudinary
import cloudinary.api
import cloudinary.uploader
from fastapi import HTTPException, status

import logging
from app.core.config import settings

logger = logging.getLogger("app.cloudinary")

# Maximum free-tier monthly credits on Cloudinary
CLOUDINARY_FREE_TIER_CREDITS = 25.0
CLOUDINARY_CREDIT_WARNING_THRESHOLD_PERCENT = 80.0
CLOUDINARY_CREDIT_WARNING_THRESHOLD_CREDITS = 20.0


def is_cloudinary_configured() -> bool:
    """
    Checks if Cloudinary credentials are validly configured either via
    CLOUDINARY_URL or via individual CLOUD_NAME / API_KEY / API_SECRET settings.
    Excludes default placeholders.
    """
    if settings.CLOUDINARY_URL and "your-" not in settings.CLOUDINARY_URL:
        return True

    if (
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
        and "your-" not in settings.CLOUDINARY_CLOUD_NAME
        and "your-" not in settings.CLOUDINARY_API_KEY
        and "your-" not in settings.CLOUDINARY_API_SECRET
    ):
        return True

    return False


def configure_cloudinary() -> None:
    """
    Initializes the Cloudinary SDK configuration with current environment settings.
    Ensures secure HTTPS URLs are returned.
    """
    if not is_cloudinary_configured():
        return

    if settings.CLOUDINARY_URL and "your-" not in settings.CLOUDINARY_URL:
        from urllib.parse import urlparse
        import os
        parsed = urlparse(settings.CLOUDINARY_URL)
        if parsed.hostname and parsed.username and parsed.password:
            cloudinary.config(
                cloud_name=parsed.hostname,
                api_key=parsed.username,
                api_secret=parsed.password,
                secure=True,
            )
        else:
            os.environ["CLOUDINARY_URL"] = settings.CLOUDINARY_URL
            cloudinary.reset_config()
    else:
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True,
        )


async def upload_file(
    file_bytes: bytes,
    public_id: Optional[str] = None,
    folder: Optional[str] = None,
    resource_type: str = "image",
    overwrite: bool = True,
) -> Dict[str, Any]:
    """
    Uploads raw file bytes to Cloudinary using authenticated server-side API.
    Runs synchronously in threadpool to avoid blocking the async event loop.
    Fails loudly with HTTP 502 on upload error, preserving Phase 15 behavior.
    """
    configure_cloudinary()

    upload_kwargs: Dict[str, Any] = {
        "resource_type": resource_type,
        "overwrite": overwrite,
        "use_filename": False,
        "unique_filename": False,
    }
    if public_id:
        upload_kwargs["public_id"] = public_id
    if folder:
        upload_kwargs["folder"] = folder

    def _sync_upload() -> Dict[str, Any]:
        return cloudinary.uploader.upload(file_bytes, **upload_kwargs)

    try:
        result = await asyncio.to_thread(_sync_upload)
        return {
            "secure_url": result.get("secure_url", ""),
            "public_id": result.get("public_id", ""),
            "format": result.get("format", ""),
            "resource_type": result.get("resource_type", resource_type),
            "bytes": result.get("bytes", len(file_bytes)),
        }
    except Exception as err:
        logger.error(f"Cloudinary upload failed: {err}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Storage upload failed. Remote storage service returned an error.",
        )


async def delete_file(public_id: str, resource_type: str = "image") -> Dict[str, Any]:
    """
    Deletes a single resource by public_id via Cloudinary Uploader API.
    """
    configure_cloudinary()

    def _sync_destroy() -> Dict[str, Any]:
        return cloudinary.uploader.destroy(public_id, resource_type=resource_type)

    try:
        return await asyncio.to_thread(_sync_destroy)
    except Exception as err:
        logger.error(f"Cloudinary destroy failed for {public_id}: {err}")
        return {"result": "error", "error": str(err)}


async def delete_resources(
    public_ids: List[str], resource_type: str = "image"
) -> Dict[str, Any]:
    """
    Deletes multiple resources by public_ids via Cloudinary Admin API.
    """
    if not public_ids:
        return {"deleted": {}}

    configure_cloudinary()

    def _sync_delete_batch() -> Dict[str, Any]:
        return cloudinary.api.delete_resources(public_ids, resource_type=resource_type)

    try:
        return await asyncio.to_thread(_sync_delete_batch)
    except Exception as err:
        logger.error(f"Cloudinary batch deletion failed: {err}")
        return {"error": str(err)}


async def list_resources(
    prefix: str = "", max_results: int = 500, resource_type: str = "image"
) -> List[Dict[str, Any]]:
    """
    Queries Cloudinary Admin API for uploaded resources matching prefix.
    """
    configure_cloudinary()

    def _sync_list() -> Dict[str, Any]:
        params: Dict[str, Any] = {
            "type": "upload",
            "max_results": max_results,
            "resource_type": resource_type,
        }
        if prefix:
            params["prefix"] = prefix
        return cloudinary.api.resources(**params)

    try:
        res = await asyncio.to_thread(_sync_list)
        return res.get("resources", [])
    except Exception as err:
        logger.warning(f"Unable to query Cloudinary Admin API: {err}")
        return []


async def check_cloudinary_usage() -> Optional[Dict[str, Any]]:
    """
    Queries Cloudinary account usage from the Admin API.
    Logs an explicit warning if credit usage approaches the 25-credit monthly pool.
    """
    if not is_cloudinary_configured():
        return None

    configure_cloudinary()

    def _sync_usage() -> Dict[str, Any]:
        return cloudinary.api.usage()

    try:
        usage = await asyncio.to_thread(_sync_usage)
        credits_info = usage.get("credits", {})
        used_credits = float(credits_info.get("usage", 0.0))
        percent_used = float(credits_info.get("percent_usage", 0.0))

        if (
            used_credits >= CLOUDINARY_CREDIT_WARNING_THRESHOLD_CREDITS
            or percent_used >= CLOUDINARY_CREDIT_WARNING_THRESHOLD_PERCENT
        ):
            logger.warning(
                f"[STORAGE AUDIT WARNING] Cloudinary usage is approaching the free-tier limit: "
                f"{used_credits:.2f} / {CLOUDINARY_FREE_TIER_CREDITS} monthly credits used "
                f"({percent_used:.1f}%). Please review storage assets or upgrade pool."
            )
        else:
            logger.info(
                f"Cloudinary usage healthy: {used_credits:.2f} / {CLOUDINARY_FREE_TIER_CREDITS} credits used ({percent_used:.1f}%)."
            )

        return usage
    except Exception as err:
        logger.warning(f"Failed to fetch Cloudinary usage metrics: {err}")
        return None
