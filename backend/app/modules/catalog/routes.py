from io import BytesIO
import logging
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from PIL import Image
import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
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
    ProductCreate,
    ProductResponse,
    ProductUpdate,
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
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    query = db.query(Product)
    if is_active is not None:
        query = query.filter(Product.is_active == is_active)
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

    return query.order_by(Product.name.asc()).all()


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
    _: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
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
        category_id=payload.category_id,
        brand_id=payload.brand_id,
        unit=payload.unit,
        purchase_price=payload.purchase_price,
        selling_price=payload.selling_price,
        gst_rate=payload.gst_rate,
        min_stock=payload.min_stock,
        current_stock=0,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@catalog_router.put("/products/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
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

    for field in ["name", "unit", "purchase_price", "selling_price", "gst_rate", "min_stock", "is_active"]:
        val = getattr(payload, field)
        if val is not None:
            setattr(product, field, val)

    db.commit()
    db.refresh(product)
    return product


@catalog_router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    product.is_active = False
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

    storage_path = f"products/{product.id}/{uuid.uuid4().hex}.webp"

    # 4. Upload to Supabase Storage if credentials are configured
    if (
        settings.SUPABASE_URL
        and settings.SUPABASE_SERVICE_KEY
        and "your-project" not in settings.SUPABASE_URL
        and "your-supabase" not in settings.SUPABASE_SERVICE_KEY
    ):
        try:
            supabase_upload_url = f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/catalog/{storage_path}"
            headers = {
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                "apikey": settings.SUPABASE_SERVICE_KEY,
                "Content-Type": "image/webp",
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(supabase_upload_url, content=webp_bytes, headers=headers)
                if resp.status_code not in (200, 201):
                    logger.warning(f"Supabase storage upload returned status {resp.status_code}: {resp.text}")
        except Exception as err:
            logger.error(f"Error uploading to Supabase Storage: {err}")

    # 5. Store storage path in DB
    product.image_path = storage_path
    db.commit()
    db.refresh(product)

    return product
