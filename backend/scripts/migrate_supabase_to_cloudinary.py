"""
One-Time Storage Migration Script: Supabase Storage -> Cloudinary
Scans existing products and support tickets with Supabase or legacy storage paths/URLs,
downloads the asset bytes, and re-uploads them to Cloudinary using authenticated server-side API.
Updates the database rows with the new Cloudinary secure_url and public_id.
"""

import asyncio
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import logging
import httpx
from app.core.config import settings
from app.core.db import SessionLocal
from app.core.cloudinary import is_cloudinary_configured, upload_file
from app.modules.catalog.models import Product
from app.modules.support.models import SupportTicket

logger = logging.getLogger("app.migration")
logging.basicConfig(level=logging.INFO)


from typing import Optional
from sqlalchemy.orm import Session


async def migrate_all(db: Optional[Session] = None) -> dict:
    if not is_cloudinary_configured():
        logger.error(
            "Cloudinary credentials are not configured. Set CLOUDINARY_URL or "
            "CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET in .env."
        )
        return {
            "status": "error",
            "message": "Cloudinary is not configured.",
            "migrated_products": 0,
            "migrated_tickets": 0,
        }

    own_db = False
    if db is None:
        db = SessionLocal()
        own_db = True

    migrated_products = 0
    migrated_tickets = 0
    errors = []

    try:
        # 1. Inspect Products
        products = (
            db.query(Product)
            .filter(Product.image_path.isnot(None))
            .all()
        )
        # Filter to products not yet hosted on Cloudinary
        pending_products = [
            p for p in products
            if p.image_path and "res.cloudinary.com" not in p.image_path
        ]
        logger.info(f"Found {len(pending_products)} product(s) to migrate to Cloudinary.")

        async with httpx.AsyncClient(timeout=30.0) as client:
            for p in pending_products:
                try:
                    file_bytes = None
                    if p.image_path.startswith("http://") or p.image_path.startswith("https://"):
                        resp = await client.get(p.image_path)
                        if resp.status_code == 200:
                            file_bytes = resp.content
                    elif settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
                        # Construct Supabase Storage URL
                        sb_url = f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/catalog/{p.image_path}"
                        headers = {
                            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                            "apikey": settings.SUPABASE_SERVICE_KEY,
                        }
                        resp = await client.get(sb_url, headers=headers)
                        if resp.status_code == 200:
                            file_bytes = resp.content

                    if file_bytes:
                        public_id = f"products/{p.id}/migrated"
                        upload_res = await upload_file(
                            file_bytes=file_bytes,
                            public_id=public_id,
                            folder=f"products/{p.id}",
                            resource_type="image",
                        )
                        p.image_path = upload_res["secure_url"]
                        p.image_public_id = upload_res["public_id"]
                        migrated_products += 1
                        logger.info(f"Migrated product {p.id} ({p.name}) -> {upload_res['secure_url']}")
                    else:
                        logger.warning(f"Could not download image bytes for product {p.id} from {p.image_path}")
                except Exception as exc:
                    err_msg = f"Failed to migrate product {p.id}: {exc}"
                    logger.error(err_msg)
                    errors.append(err_msg)

            # 2. Inspect Support Tickets
            tickets = (
                db.query(SupportTicket)
                .filter(SupportTicket.attachment_path.isnot(None))
                .all()
            )
            pending_tickets = [
                t for t in tickets
                if t.attachment_path and "res.cloudinary.com" not in t.attachment_path
            ]
            logger.info(f"Found {len(pending_tickets)} ticket attachment(s) to migrate to Cloudinary.")

            for t in pending_tickets:
                try:
                    file_bytes = None
                    if t.attachment_path.startswith("http://") or t.attachment_path.startswith("https://"):
                        resp = await client.get(t.attachment_path)
                        if resp.status_code == 200:
                            file_bytes = resp.content
                    elif settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
                        sb_url = f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/catalog/{t.attachment_path}"
                        headers = {
                            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                            "apikey": settings.SUPABASE_SERVICE_KEY,
                        }
                        resp = await client.get(sb_url, headers=headers)
                        if resp.status_code == 200:
                            file_bytes = resp.content

                    if file_bytes:
                        public_id = f"tickets/{t.customer_id}/{t.id}_migrated"
                        upload_res = await upload_file(
                            file_bytes=file_bytes,
                            public_id=public_id,
                            folder=f"tickets/{t.customer_id}",
                            resource_type="auto",
                        )
                        t.attachment_path = upload_res["secure_url"]
                        t.attachment_public_id = upload_res["public_id"]
                        migrated_tickets += 1
                        logger.info(f"Migrated ticket {t.ticket_number} -> {upload_res['secure_url']}")
                    else:
                        logger.warning(f"Could not download attachment bytes for ticket {t.id} from {t.attachment_path}")
                except Exception as exc:
                    err_msg = f"Failed to migrate ticket {t.id}: {exc}"
                    logger.error(err_msg)
                    errors.append(err_msg)

        db.commit()
    finally:
        if own_db:
            db.close()

    summary = {
        "status": "success" if not errors else "partial",
        "migrated_products": migrated_products,
        "migrated_tickets": migrated_tickets,
        "total_migrated": migrated_products + migrated_tickets,
        "errors": errors,
    }
    logger.info(f"Migration completed: {summary}")
    return summary


if __name__ == "__main__":
    result = asyncio.run(migrate_all())
    print(f"Migration Summary: {result}")
