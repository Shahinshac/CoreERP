import logging
from sqlalchemy.orm import Session
from app.modules.catalog.models import Brand, Category

logger = logging.getLogger("app.catalog.bootstrap")

DEFAULT_CATEGORIES = [
    {"name": "Electronics", "description": "Electronic gadgets, devices, and hardware components"},
    {"name": "Smartphones & Tablets", "description": "Mobile phones, tablets, smart wearables and mobile accessories"},
    {"name": "Computers & Laptops", "description": "Desktops, laptops, monitors, workstations and servers"},
    {"name": "Computer Accessories", "description": "Keyboards, mice, webcams, cables, adapters, and peripherals"},
    {"name": "Audio & Wearables", "description": "Headphones, earphones, speakers, smart watches and audio devices"},
    {"name": "Office Supplies & Stationery", "description": "Paper, printers, ink, cartridges, pens, and office essentials"},
    {"name": "Home Appliances", "description": "Small and large domestic electrical appliances"},
    {"name": "Networking & Cables", "description": "Routers, switches, patch cords, Wi-Fi adapters and network gear"},
    {"name": "Printers & Consumables", "description": "Laser, inkjet printers, thermal receipt printers, toner and ribbons"},
    {"name": "General Merchandise", "description": "Miscellaneous retail products and supplies"},
]

DEFAULT_BRANDS = [
    "Apple",
    "Samsung",
    "Dell",
    "HP",
    "Lenovo",
    "Asus",
    "Logitech",
    "Sony",
    "Canon",
    "Epson",
    "SanDisk",
    "Generic / Unbranded",
]


def bootstrap_catalog_defaults(db: Session) -> dict[str, int]:
    """
    Idempotently seeds standard starter categories and brands if they do not already exist.
    Safe to run repeatedly across dev, test, and production environments.
    """
    seeded_categories = 0
    seeded_brands = 0

    try:
        existing_cats = {c.name.strip().lower() for c in db.query(Category.name).all()}
        for cat_data in DEFAULT_CATEGORIES:
            cat_name = cat_data["name"].strip()
            if cat_name.lower() not in existing_cats:
                db.add(Category(name=cat_name, description=cat_data["description"]))
                existing_cats.add(cat_name.lower())
                seeded_categories += 1

        existing_brands = {b.name.strip().lower() for b in db.query(Brand.name).all()}
        for brand_name in DEFAULT_BRANDS:
            b_name = brand_name.strip()
            if b_name.lower() not in existing_brands:
                db.add(Brand(name=b_name))
                existing_brands.add(b_name.lower())
                seeded_brands += 1

        if seeded_categories > 0 or seeded_brands > 0:
            db.commit()
            logger.info(
                f"Bootstrapped {seeded_categories} categories and {seeded_brands} brands into catalog."
            )

        return {"categories_added": seeded_categories, "brands_added": seeded_brands}
    except Exception as exc:
        db.rollback()
        logger.warning(f"Catalog bootstrap encountered an issue: {exc}")
        return {"categories_added": 0, "brands_added": 0}
