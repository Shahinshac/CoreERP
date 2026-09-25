import asyncio
from decimal import Decimal
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.cloudinary import (
    check_cloudinary_usage,
    is_cloudinary_configured,
    upload_file,
    delete_resources,
    list_resources,
)
from app.modules.auth.models import Customer
from app.modules.catalog.models import Brand, Category, Product
from app.modules.support.models import SupportTicket
from app.modules.automation.service import run_orphaned_storage_cleanup
from scripts.migrate_supabase_to_cloudinary import migrate_all


def test_cloudinary_configuration_detection():
    # 1. Unconfigured when empty
    with patch.object(settings, "CLOUDINARY_URL", ""), \
         patch.object(settings, "CLOUDINARY_CLOUD_NAME", ""), \
         patch.object(settings, "CLOUDINARY_API_KEY", ""), \
         patch.object(settings, "CLOUDINARY_API_SECRET", ""):
        assert not is_cloudinary_configured()

    # 2. Configured via CLOUDINARY_URL
    with patch.object(settings, "CLOUDINARY_URL", "cloudinary://api_key:api_secret@test-cloud"):
        assert is_cloudinary_configured()

    # 3. Configured via discrete keys
    with patch.object(settings, "CLOUDINARY_URL", ""), \
         patch.object(settings, "CLOUDINARY_CLOUD_NAME", "my-cloud"), \
         patch.object(settings, "CLOUDINARY_API_KEY", "123456789"), \
         patch.object(settings, "CLOUDINARY_API_SECRET", "secret-xyz"):
        assert is_cloudinary_configured()


@pytest.mark.asyncio
async def test_cloudinary_upload_file_and_502_error_handling():
    # Test upload_file helper success
    with patch("cloudinary.uploader.upload", return_value={
        "secure_url": "https://res.cloudinary.com/test-cloud/image/upload/v1/sample.webp",
        "public_id": "sample",
        "format": "webp",
        "resource_type": "image",
        "bytes": 512,
    }):
        res = await upload_file(b"dummy_bytes", public_id="sample")
        assert res["secure_url"] == "https://res.cloudinary.com/test-cloud/image/upload/v1/sample.webp"
        assert res["public_id"] == "sample"

    # Test upload_file helper failure raises 502
    with patch("cloudinary.uploader.upload", side_effect=Exception("Connection reset")):
        with pytest.raises(Exception) as excinfo:
            await upload_file(b"dummy_bytes")
        assert "502" in str(excinfo.value)


@pytest.mark.asyncio
async def test_cloudinary_free_tier_usage_warning_threshold(caplog):
    # 1. Healthy usage (<80%, <20 credits) does not log warning
    with patch.object(settings, "CLOUDINARY_URL", "cloudinary://k:s@cloud"), \
         patch("cloudinary.api.usage", return_value={"plan": "Free", "credits": {"usage": 5.0, "percent_usage": 20.0}}):
        usage = await check_cloudinary_usage()
        assert usage is not None
        assert not any("STORAGE AUDIT WARNING" in r.message for r in caplog.records)

    # 2. Approaching 25 credits (>=20 credits or >=80%) logs warning
    caplog.clear()
    with patch.object(settings, "CLOUDINARY_URL", "cloudinary://k:s@cloud"), \
         patch("cloudinary.api.usage", return_value={"plan": "Free", "credits": {"usage": 21.5, "percent_usage": 86.0}}):
        usage2 = await check_cloudinary_usage()
        assert usage2 is not None
        assert any("STORAGE AUDIT WARNING" in r.message for r in caplog.records)
        assert any("21.50 / 25.0 monthly credits used" in r.message for r in caplog.records)


def test_portal_ticket_attachment_cloudinary_upload_and_failure(client: TestClient, db_session: Session):
    # Register test customer
    cust = Customer(
        email=f"cld-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="argon2_fake",
        name="Cloudinary Customer",
        is_active=True,
    )
    db_session.add(cust)
    db_session.commit()

    # Generate customer JWT token
    from app.core.security import create_access_token
    token = create_access_token(subject=str(cust.id), audience="customer")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Successful upload to Cloudinary stores secure_url and public_id
    with patch.object(settings, "CLOUDINARY_URL", "cloudinary://test_key:test_secret@test_cloud"), \
         patch("cloudinary.uploader.upload", return_value={
             "secure_url": "https://res.cloudinary.com/test_cloud/image/upload/v123/tickets/attachment.webp",
             "public_id": f"tickets/{cust.id}/tkt_test",
             "format": "webp",
             "bytes": 500,
         }):

        form_data = {
            "subject": "Screen cracked on arrival",
            "description": "Please find attached photo of the damaged screen.",
            "priority": "high",
        }
        file_data = {"attachment": ("screen.png", b"fake_png_data", "image/png")}

        resp = client.post("/api/portal/tickets", data=form_data, files=file_data, headers=headers)
        assert resp.status_code == 201
        t_data = resp.json()
        assert t_data["attachment_path"] == "https://res.cloudinary.com/test_cloud/image/upload/v123/tickets/attachment.webp"
        assert t_data["attachment_public_id"] == f"tickets/{cust.id}/tkt_test"

        # Verify DB
        ticket = db_session.query(SupportTicket).filter(SupportTicket.id == uuid.UUID(t_data["id"])).first()
        assert ticket is not None
        assert ticket.attachment_path == t_data["attachment_path"]
        assert ticket.attachment_public_id == t_data["attachment_public_id"]

    # 2. Cloudinary failure mid-request returns 502 and does NOT create ticket
    with patch.object(settings, "CLOUDINARY_URL", "cloudinary://test_key:test_secret@test_cloud"), \
         patch("cloudinary.uploader.upload", side_effect=Exception("Network failure")):

        form_data2 = {
            "subject": "Audio glitch",
            "description": "Attached log file for reference.",
            "priority": "medium",
        }
        file_data2 = {"attachment": ("error_log.pdf", b"fake_pdf_data", "application/pdf")}

        resp_fail = client.post("/api/portal/tickets", data=form_data2, files=file_data2, headers=headers)
        assert resp_fail.status_code == 502
        err_msg = resp_fail.json().get("detail") or resp_fail.json().get("error", {}).get("message", "")
        assert "Storage upload failed" in err_msg


@pytest.mark.asyncio
async def test_orphaned_cleanup_with_cloudinary_api(db_session: Session):
    # Create active product referencing image
    cat = Category(name=f"Cat-{uuid.uuid4().hex[:6]}")
    brand = Brand(name=f"Brand-{uuid.uuid4().hex[:6]}")
    db_session.add_all([cat, brand])
    db_session.commit()

    active_public_id = f"products/{uuid.uuid4().hex[:8]}/active_prod"
    prod = Product(
        name="Active Cloudinary Prod",
        sku=f"SKU-{uuid.uuid4().hex[:6]}",
        category_id=cat.id,
        brand_id=brand.id,
        purchase_price=Decimal("10.00"),
        selling_price=Decimal("20.00"),
        image_path=f"https://res.cloudinary.com/test-cloud/image/upload/{active_public_id}.webp",
        image_public_id=active_public_id,
    )
    db_session.add(prod)
    db_session.commit()

    # Cloudinary resources list returns active item + 2 orphaned items
    mock_resources = [
        {"public_id": active_public_id, "secure_url": prod.image_path},
        {"public_id": "products/old/orphan1", "secure_url": "https://res.cloudinary.com/test-cloud/image/upload/products/old/orphan1.webp"},
        {"public_id": "tickets/old/orphan2", "secure_url": "https://res.cloudinary.com/test-cloud/image/upload/tickets/old/orphan2.webp"},
    ]

    with patch.object(settings, "CLOUDINARY_URL", "cloudinary://k:s@cloud"), \
         patch("app.modules.automation.service.list_resources", new_callable=AsyncMock) as mock_list, \
         patch("app.modules.automation.service.delete_resources", new_callable=AsyncMock) as mock_del, \
         patch("app.modules.automation.service.check_cloudinary_usage", new_callable=AsyncMock) as mock_usage:

        mock_list.return_value = mock_resources
        mock_del.return_value = {"deleted": {"products/old/orphan1": "deleted", "tickets/old/orphan2": "deleted"}}
        mock_usage.return_value = {"credits": {"usage": 10.0, "percent_usage": 40.0}}

        # Dry run
        dry_result = await run_orphaned_storage_cleanup(db_session, dry_run=True)
        assert dry_result["dry_run"] is True
        assert dry_result["storage_provider"] == "cloudinary"
        assert dry_result["orphaned_count"] == 2
        assert dry_result["deleted_count"] == 0
        assert active_public_id not in dry_result["orphaned_keys"]
        assert "products/old/orphan1" in dry_result["orphaned_keys"]

        # Live deletion run
        live_result = await run_orphaned_storage_cleanup(db_session, dry_run=False)
        assert live_result["dry_run"] is False
        assert live_result["orphaned_count"] == 2
        assert live_result["deleted_count"] == 2
        assert "products/old/orphan1" in live_result["deleted_keys"]
        mock_del.assert_called_once()


@pytest.mark.asyncio
async def test_migration_script_executes_safely(db_session: Session):
    with patch.object(settings, "CLOUDINARY_URL", "cloudinary://k:s@cloud"), \
         patch("scripts.migrate_supabase_to_cloudinary.upload_file", new_callable=AsyncMock) as mock_up:
        mock_up.return_value = {
            "secure_url": "https://res.cloudinary.com/cloud/image/upload/sample.webp",
            "public_id": "sample_id",
        }
        res = await migrate_all(db=db_session)
        assert res["status"] == "success"
        assert res["errors"] == []
