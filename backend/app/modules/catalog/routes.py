import csv
from decimal import Decimal
from io import BytesIO, StringIO
import logging
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from PIL import Image
import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.cloudinary import is_cloudinary_configured, upload_file
from app.core.db import get_db
from app.core.money import validate_money_decimal, validate_quantity_decimal
from app.modules.audit.service import log_audit_event
from app.modules.auth.dependencies import get_current_staff, require_roles
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.catalog.schemas import (
    BrandCreate,
    BrandResponse,
    BrandUpdate,
    CategoryCreate,
    CategoryResponse,
    CategoryUpdate,
    ImportConfirmResponse,
    ImportPreviewResponse,
    ProductCreate,
    ProductPinUpdate,
    ProductResponse,
    ProductUpdate,
    RowImportResult,
)

logger = logging.getLogger("app.catalog")

catalog_router = APIRouter(prefix="/api/catalog", tags=["Catalog"])


# ==========================================
# CATEGORIES
# ==========================================

@catalog_router.get("/categories", response_model=list[CategoryResponse])
def list_categories(
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    return db.query(Category).order_by(Category.name.asc()).all()


@catalog_router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    existing = db.query(Category).filter(Category.name.ilike(payload.name)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Category with name '{payload.name}' already exists.",
        )
    category = Category(name=payload.name, description=payload.description)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@catalog_router.put("/categories/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: uuid.UUID,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")

    if payload.name is not None:
        conflict = (
            db.query(Category)
            .filter(Category.name.ilike(payload.name), Category.id != category_id)
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Category with name '{payload.name}' already exists.",
            )
        category.name = payload.name

    if payload.description is not None:
        category.description = payload.description

    db.commit()
    db.refresh(category)
    return category


@catalog_router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")

    has_products = db.query(Product).filter(Product.category_id == category_id).first()
    if has_products:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete category linked to existing products.",
        )

    db.delete(category)
    db.commit()
    return None


# ==========================================
# BRANDS
# ==========================================

@catalog_router.get("/brands", response_model=list[BrandResponse])
def list_brands(
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    return db.query(Brand).order_by(Brand.name.asc()).all()


@catalog_router.post("/brands", response_model=BrandResponse, status_code=status.HTTP_201_CREATED)
def create_brand(
    payload: BrandCreate,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    existing = db.query(Brand).filter(Brand.name.ilike(payload.name)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Brand with name '{payload.name}' already exists.",
        )
    brand = Brand(name=payload.name)
    db.add(brand)
    db.commit()
    db.refresh(brand)
    return brand


@catalog_router.put("/brands/{brand_id}", response_model=BrandResponse)
def update_brand(
    brand_id: uuid.UUID,
    payload: BrandUpdate,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")

    if payload.name is not None:
        conflict = (
            db.query(Brand)
            .filter(Brand.name.ilike(payload.name), Brand.id != brand_id)
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Brand with name '{payload.name}' already exists.",
            )
        brand.name = payload.name

    db.commit()
    db.refresh(brand)
    return brand


@catalog_router.delete("/brands/{brand_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_brand(
    brand_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")

    has_products = db.query(Product).filter(Product.brand_id == brand_id).first()
    if has_products:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete brand linked to existing products.",
        )

    db.delete(brand)
    db.commit()
    return None


# ==========================================
# PRODUCTS
# ==========================================

@catalog_router.get("/products", response_model=list[ProductResponse])
def list_products(
    category_id: uuid.UUID | None = Query(None),
    brand_id: uuid.UUID | None = Query(None),
    search: str | None = Query(None),
    low_stock_only: bool = Query(False),
    is_active: bool | None = Query(True),
    is_pinned: bool | None = Query(None),
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    query = db.query(Product)
    if is_active is not None:
        query = query.filter(Product.is_active == is_active)
    if is_pinned is not None:
        query = query.filter(Product.is_pinned == is_pinned)
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if brand_id:
        query = query.filter(Product.brand_id == brand_id)
    if low_stock_only:
        query = query.filter(Product.current_stock <= Product.min_stock)
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Product.name.ilike(search_pattern))
            | (Product.sku.ilike(search_pattern))
            | (Product.barcode.ilike(search_pattern))
        )

    return query.order_by(Product.is_pinned.desc(), Product.name.asc()).all()


@catalog_router.get("/products/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
    return product


@catalog_router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    # Verify SKU uniqueness
    if db.query(Product).filter(Product.sku.ilike(payload.sku)).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Product with SKU '{payload.sku}' already exists.",
        )

    # Verify Barcode uniqueness if supplied
    if payload.barcode:
        if db.query(Product).filter(Product.barcode == payload.barcode).first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Product with barcode '{payload.barcode}' already exists.",
            )

    # Check category and brand existence
    if not db.query(Category).filter(Category.id == payload.category_id).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid category_id.")
    if not db.query(Brand).filter(Brand.id == payload.brand_id).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid brand_id.")

    product = Product(
        name=payload.name,
        sku=payload.sku,
        barcode=payload.barcode,
        hsn_code=payload.hsn_code,
        category_id=payload.category_id,
        brand_id=payload.brand_id,
        unit=payload.unit,
        purchase_price=payload.purchase_price,
        selling_price=payload.selling_price,
        gst_rate=payload.gst_rate,
        min_stock=payload.min_stock,
        is_pinned=payload.is_pinned,
        current_stock=0,
    )
    db.add(product)
    db.flush()
    log_audit_event(
        db=db,
        event_type="catalog.product_created",
        description=f"Product '{product.name}' (SKU: {product.sku}) created.",
        actor_id=current_staff.id if current_staff else None,
        actor_type="staff",
        actor_email=current_staff.email if current_staff else None,
        resource_type="product",
        resource_id=str(product.id),
        details={"sku": product.sku, "name": product.name, "selling_price": str(product.selling_price)},
    )
    db.commit()
    db.refresh(product)
    return product


@catalog_router.put("/products/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    if payload.sku is not None and payload.sku != product.sku:
        conflict = db.query(Product).filter(Product.sku.ilike(payload.sku), Product.id != product_id).first()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Product with SKU '{payload.sku}' already exists.",
            )
        product.sku = payload.sku

    if payload.barcode is not None and payload.barcode != product.barcode:
        conflict = db.query(Product).filter(Product.barcode == payload.barcode, Product.id != product_id).first()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Product with barcode '{payload.barcode}' already exists.",
            )
        product.barcode = payload.barcode

    if payload.category_id is not None:
        if not db.query(Category).filter(Category.id == payload.category_id).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid category_id.")
        product.category_id = payload.category_id

    if payload.brand_id is not None:
        if not db.query(Brand).filter(Brand.id == payload.brand_id).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid brand_id.")
        product.brand_id = payload.brand_id

    for field in ["name", "hsn_code", "unit", "purchase_price", "selling_price", "gst_rate", "min_stock", "is_active", "is_pinned"]:
        val = getattr(payload, field)
        if val is not None:
            setattr(product, field, val)

    log_audit_event(
        db=db,
        event_type="catalog.product_updated",
        description=f"Product '{product.name}' (SKU: {product.sku}) updated.",
        actor_id=current_staff.id if current_staff else None,
        actor_type="staff",
        actor_email=current_staff.email if current_staff else None,
        resource_type="product",
        resource_id=str(product.id),
        details={"sku": product.sku, "name": product.name},
    )
    db.commit()
    db.refresh(product)
    return product


@catalog_router.patch("/products/{product_id}/pin", response_model=ProductResponse)
def toggle_product_pin(
    product_id: uuid.UUID,
    payload: ProductPinUpdate,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    product.is_pinned = payload.is_pinned
    log_audit_event(
        db=db,
        event_type="catalog.product_pinned" if payload.is_pinned else "catalog.product_unpinned",
        description=f"Product '{product.name}' (SKU: {product.sku}) {'pinned' if payload.is_pinned else 'unpinned'}.",
        actor_id=current_staff.id if current_staff else None,
        actor_type="staff",
        actor_email=current_staff.email if current_staff else None,
        resource_type="product",
        resource_id=str(product.id),
        details={"sku": product.sku, "is_pinned": product.is_pinned},
    )
    db.commit()
    db.refresh(product)
    return product


@catalog_router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    product.is_active = False
    log_audit_event(
        db=db,
        event_type="catalog.product_deleted",
        description=f"Product '{product.name}' (SKU: {product.sku}) deactivated.",
        actor_id=current_staff.id if current_staff else None,
        actor_type="staff",
        actor_email=current_staff.email if current_staff else None,
        resource_type="product",
        resource_id=str(product.id),
    )
    db.commit()
    return None


# ==========================================
# PRODUCT IMAGE UPLOAD
# ==========================================

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024  # 2MB


@catalog_router.post("/products/{product_id}/image", response_model=ProductResponse)
async def upload_product_image(
    product_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    # 1. Validate MIME type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image type '{file.content_type}'. Allowed types: JPG, PNG, WebP.",
        )

    # 2. Read content and validate size (<= 2MB)
    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed limit of 2MB (got {len(content)} bytes).",
        )

    # 3. Process image with Pillow (Resize to max 800x800, convert to WebP)
    try:
        image = Image.open(BytesIO(content))
        if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
            img_to_save = image.convert("RGBA")
        else:
            img_to_save = image.convert("RGB")
        img_to_save.thumbnail((800, 800))
        output_buffer = BytesIO()
        img_to_save.save(output_buffer, format="WEBP", quality=85)
        webp_bytes = output_buffer.getvalue()
    except Exception as exc:
        logger.warning(f"Corrupted or invalid image file uploaded: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to process image. File is corrupted or not a valid image.",
        )

    image_hash = uuid.uuid4().hex
    public_id = f"products/{product.id}/{image_hash}"
    fallback_path = f"products/{product.id}/{image_hash}.webp"

    # 4. Upload to Cloudinary if credentials are configured
    if is_cloudinary_configured():
        upload_res = await upload_file(
            file_bytes=webp_bytes,
            public_id=public_id,
            folder=f"products/{product.id}",
            resource_type="image",
        )
        product.image_path = upload_res["secure_url"]
        product.image_public_id = upload_res["public_id"]
    elif (
        settings.SUPABASE_URL
        and settings.SUPABASE_SERVICE_KEY
        and "your-project" not in settings.SUPABASE_URL
        and "your-supabase" not in settings.SUPABASE_SERVICE_KEY
    ):
        # Dual-provider fallback if Supabase is still configured
        try:
            supabase_upload_url = f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/catalog/{fallback_path}"
            headers = {
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                "apikey": settings.SUPABASE_SERVICE_KEY,
                "Content-Type": "image/webp",
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(supabase_upload_url, content=webp_bytes, headers=headers)
                if resp.status_code not in (200, 201):
                    logger.error(f"Storage upload returned status {resp.status_code}: {resp.text}")
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="Storage upload failed. Remote storage service returned an error.",
                    )
        except HTTPException:
            raise
        except Exception as err:
            logger.error(f"Error uploading to storage: {err}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to upload image to remote storage service. Please try again later.",
            )
        product.image_path = fallback_path
        product.image_public_id = public_id
    else:
        # Development / test unconfigured fallback
        product.image_path = fallback_path
        product.image_public_id = public_id

    # 5. Commit changes to DB
    db.commit()
    db.refresh(product)

    return product


# ==========================================
# BULK CSV IMPORT
# ==========================================

def _parse_and_validate_product_rows(db: Session, reader: csv.DictReader) -> list[RowImportResult]:
    seen_skus = set()
    seen_barcodes = set()
    categories_cache = {c.name.strip().lower(): c for c in db.query(Category).all()}
    for c in list(categories_cache.values()):
        categories_cache[str(c.id).lower()] = c

    brands_cache = {b.name.strip().lower(): b for b in db.query(Brand).all()}
    for b in list(brands_cache.values()):
        brands_cache[str(b.id).lower()] = b

    results: list[RowImportResult] = []

    for idx, raw_row in enumerate(reader, start=2):
        norm_row = {k.strip().lower(): (v.strip() if v else "") for k, v in raw_row.items() if k}
        errors: list[str] = []

        name = norm_row.get("name") or norm_row.get("product_name") or ""
        sku = norm_row.get("sku") or norm_row.get("sku_code") or ""
        barcode = norm_row.get("barcode") or norm_row.get("barcode_ean") or None
        hsn_code = norm_row.get("hsn_code") or norm_row.get("hsn") or norm_row.get("sac") or None
        cat_key = (norm_row.get("category") or norm_row.get("category_name") or norm_row.get("category_id") or "").strip().lower()
        brand_key = (norm_row.get("brand") or norm_row.get("brand_name") or norm_row.get("brand_id") or "").strip().lower()
        unit = norm_row.get("unit") or "pcs"
        purchase_price_str = norm_row.get("purchase_price") or norm_row.get("cost_price") or ""
        selling_price_str = norm_row.get("selling_price") or norm_row.get("price") or ""
        gst_rate_str = norm_row.get("gst_rate") or norm_row.get("gst") or "0.00"
        min_stock_str = norm_row.get("min_stock") or "0.000"
        is_pinned_str = norm_row.get("is_pinned") or norm_row.get("pinned") or "false"
        is_pinned = is_pinned_str.lower() in ("true", "1", "yes", "y")

        if not name:
            errors.append("Product name is required.")
        if not sku:
            errors.append("SKU is required.")
        else:
            sku_lower = sku.lower()
            if sku_lower in seen_skus:
                errors.append(f"Duplicate SKU '{sku}' in import batch.")
            else:
                seen_skus.add(sku_lower)
                existing = db.query(Product).filter(Product.sku.ilike(sku)).first()
                if existing:
                    errors.append(f"Product with SKU '{sku}' already exists.")

        if barcode:
            bc_lower = barcode.lower()
            if bc_lower in seen_barcodes:
                errors.append(f"Duplicate barcode '{barcode}' in import batch.")
            else:
                seen_barcodes.add(bc_lower)
                existing_bc = db.query(Product).filter(Product.barcode == barcode).first()
                if existing_bc:
                    errors.append(f"Product with barcode '{barcode}' already exists.")

        cat_obj = categories_cache.get(cat_key)
        if not cat_key:
            errors.append("Category is required.")
        elif not cat_obj:
            errors.append(f"Category '{norm_row.get('category') or cat_key}' does not exist.")

        brand_obj = brands_cache.get(brand_key)
        if not brand_key:
            errors.append("Brand is required.")
        elif not brand_obj:
            errors.append(f"Brand '{norm_row.get('brand') or brand_key}' does not exist.")

        purchase_price = Decimal("0.00")
        if not purchase_price_str:
            errors.append("Purchase price is required.")
        else:
            try:
                purchase_price = validate_money_decimal(purchase_price_str, allow_negative=False, field_name="Purchase price")
            except Exception as e:
                errors.append(str(e))

        selling_price = Decimal("0.00")
        if not selling_price_str:
            errors.append("Selling price is required.")
        else:
            try:
                selling_price = validate_money_decimal(selling_price_str, allow_negative=False, field_name="Selling price")
            except Exception as e:
                errors.append(str(e))

        gst_rate = Decimal("0.00")
        try:
            gst_rate = validate_money_decimal(gst_rate_str, allow_negative=False, field_name="GST rate")
        except Exception as e:
            errors.append(str(e))

        min_stock = Decimal("0.000")
        try:
            min_stock = validate_quantity_decimal(min_stock_str, allow_negative=False, field_name="Minimum stock")
        except Exception as e:
            errors.append(str(e))

        parsed_data = {
            "name": name,
            "sku": sku,
            "barcode": barcode,
            "hsn_code": hsn_code,
            "category_id": str(cat_obj.id) if cat_obj else None,
            "category_name": cat_obj.name if cat_obj else (norm_row.get("category") or ""),
            "brand_id": str(brand_obj.id) if brand_obj else None,
            "brand_name": brand_obj.name if brand_obj else (norm_row.get("brand") or ""),
            "unit": unit,
            "purchase_price": str(purchase_price),
            "selling_price": str(selling_price),
            "gst_rate": str(gst_rate),
            "min_stock": str(min_stock),
            "is_pinned": is_pinned,
        }

        results.append(
            RowImportResult(
                row_number=idx,
                data=parsed_data,
                is_valid=(len(errors) == 0),
                errors=errors,
            )
        )
    return results


@catalog_router.post("/products/import/preview", response_model=ImportPreviewResponse)
async def preview_product_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV file is empty or missing headers.")

    results = _parse_and_validate_product_rows(db, reader)
    valid_count = sum(1 for r in results if r.is_valid)

    return ImportPreviewResponse(
        total_rows=len(results),
        valid_count=valid_count,
        invalid_count=len(results) - valid_count,
        rows=results,
    )


@catalog_router.post("/products/import/confirm", response_model=ImportConfirmResponse)
async def confirm_product_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV file is empty or missing headers.")

    results = _parse_and_validate_product_rows(db, reader)
    imported_count = 0
    skipped_count = 0

    for res in results:
        if res.is_valid:
            d = res.data
            product = Product(
                name=d["name"],
                sku=d["sku"],
                barcode=d["barcode"],
                hsn_code=d["hsn_code"],
                category_id=uuid.UUID(d["category_id"]),
                brand_id=uuid.UUID(d["brand_id"]),
                unit=d["unit"],
                purchase_price=Decimal(d["purchase_price"]),
                selling_price=Decimal(d["selling_price"]),
                gst_rate=Decimal(d["gst_rate"]),
                min_stock=Decimal(d["min_stock"]),
                is_pinned=bool(d["is_pinned"]),
                current_stock=0,
                is_active=True,
            )
            db.add(product)
            imported_count += 1
        else:
            skipped_count += 1

    if imported_count > 0:
        db.commit()
        log_audit_event(
            db=db,
            event_type="catalog.products_bulk_imported",
            description=f"Bulk imported {imported_count} products ({skipped_count} invalid skipped).",
            actor_id=current_staff.id if current_staff else None,
            actor_type="staff",
            actor_email=current_staff.email if current_staff else None,
            resource_type="product",
            details={"imported_count": imported_count, "skipped_count": skipped_count},
        )

    return ImportConfirmResponse(
        total_processed=len(results),
        imported_count=imported_count,
        skipped_count=skipped_count,
        results=results,
    )
