from typing import Any, TypeVar
import uuid
from sqlalchemy.orm import Query

from app.modules.auth.models import Customer

T = TypeVar("T")


def filter_customer_scope(query: Query[T], model: Any, customer: Customer | uuid.UUID | str) -> Query[T]:
    """
    Enforces customer-tenant data isolation on SQLAlchemy queries.
    Strictly filters query results to records belonging to the authenticated customer.
    Raises ValueError if the model lacks a 'customer_id' foreign key/attribute.
    """
    if not hasattr(model, "customer_id"):
        raise ValueError(
            f"Customer isolation violation: Model '{model.__name__}' does not have a 'customer_id' column."
        )

    customer_id = customer.id if isinstance(customer, Customer) else customer
    if isinstance(customer_id, str):
        try:
            customer_id = uuid.UUID(customer_id)
        except ValueError as exc:
            raise ValueError(f"Invalid customer ID: '{customer_id}'") from exc

    return query.filter(getattr(model, "customer_id") == customer_id)
