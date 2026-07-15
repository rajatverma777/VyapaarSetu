from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import get_database
from app.core.security import serialize_doc, require_permission
from bson import ObjectId
from datetime import datetime
from typing import Optional

router = APIRouter()


def _safe_objectid(val: str):
    """Return ObjectId if valid, else None."""
    try:
        return ObjectId(val)
    except Exception:
        return None


@router.get("/history")
async def get_price_history(
    product_id: str = Query(..., description="Product ID to fetch price history for"),
    customer_id: Optional[str] = Query(None, description="Customer ID for customer-specific history"),
    limit: int = Query(20, ge=1, le=100),
    db=Depends(get_database),
    current_user=Depends(require_permission(["can_view_sales", "can_create_sales"])),
):
    """
    Returns pricing intelligence for a product:
    - Customer-specific purchase history (if customer_id provided)
    - Global price history across all customers
    - Statistical suggestions (last, average, recommended, most-used price)
    - Profit metadata from the product record
    """
    prod_oid = _safe_objectid(product_id)
    if not prod_oid:
        raise HTTPException(status_code=400, detail="Invalid product_id")

    # ── Fetch product meta ─────────────────────────────────────────────────────
    product = await db.products.find_one({"_id": prod_oid})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    purchase_price = product.get("purchase_price", 0.0) or 0.0
    current_stock = product.get("current_stock", 0)
    mrp = product.get("mrp") or product.get("selling_price") or 0.0
    selling_price = product.get("selling_price", 0.0) or 0.0

    # ── Customer-specific history pipeline ────────────────────────────────────
    customer_history = []
    customer_label = None

    if customer_id:
        cust_oid = _safe_objectid(customer_id)
        cust_pipeline = [
            {
                "$match": {
                    "sale_type": "sale",
                    "customer_id": customer_id,
                }
            },
            {"$unwind": "$items"},
            {
                "$match": {
                    "items.product_id": product_id,
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "invoice_number": 1,
                    "sale_date": 1,
                    "customer_name": 1,
                    "customer_id": 1,
                    "rate": "$items.rate",
                    "quantity": "$items.quantity",
                    "discount_percent": "$items.discount_percent",
                    "discount_amount": "$items.discount_amount",
                    "taxable_amount": "$items.taxable_amount",
                    "total_amount": "$items.total_amount",
                    "batch_no": "$items.batch_no",
                }
            },
            {"$sort": {"sale_date": -1}},
            {"$limit": limit},
        ]

        cust_results = await db.sales.aggregate(cust_pipeline).to_list(limit)
        now = datetime.utcnow()

        for doc in cust_results:
            sale_date = doc.get("sale_date")
            days_ago = None
            if sale_date:
                days_ago = (now - sale_date).days if isinstance(sale_date, datetime) else None
            customer_history.append(
                {
                    "id": str(doc["_id"]),
                    "invoice_number": doc.get("invoice_number", ""),
                    "sale_date": sale_date.isoformat() if isinstance(sale_date, datetime) else None,
                    "days_ago": days_ago,
                    "customer_name": doc.get("customer_name", ""),
                    "customer_id": doc.get("customer_id"),
                    "rate": doc.get("rate", 0),
                    "quantity": doc.get("quantity", 0),
                    "discount_percent": doc.get("discount_percent", 0),
                    "discount_amount": doc.get("discount_amount", 0),
                    "taxable_amount": doc.get("taxable_amount", 0),
                    "total_amount": doc.get("total_amount", 0),
                    "batch_no": doc.get("batch_no"),
                }
            )

        # Build natural-language customer label
        if customer_history:
            last_rate = customer_history[0]["rate"]
            cust_doc = await db.customers.find_one({"_id": cust_oid}) if cust_oid else None
            cust_name = cust_doc.get("name", "This customer") if cust_doc else "This customer"
            first_name = cust_name.split()[0] if cust_name else "This customer"
            customer_label = f"{first_name} usually buys at ₹{last_rate:.2f}"

    # ── Global history pipeline (all customers) ────────────────────────────────
    global_pipeline = [
        {"$match": {"sale_type": "sale"}},
        {"$unwind": "$items"},
        {"$match": {"items.product_id": product_id}},
        {
            "$project": {
                "_id": 1,
                "invoice_number": 1,
                "sale_date": 1,
                "customer_name": 1,
                "customer_id": 1,
                "rate": "$items.rate",
                "quantity": "$items.quantity",
                "discount_percent": "$items.discount_percent",
            }
        },
        {"$sort": {"sale_date": -1}},
        {"$limit": limit},
    ]

    global_results = await db.sales.aggregate(global_pipeline).to_list(limit)
    now = datetime.utcnow()

    global_history = []
    for doc in global_results:
        sale_date = doc.get("sale_date")
        days_ago = None
        if sale_date and isinstance(sale_date, datetime):
            days_ago = (now - sale_date).days
        global_history.append(
            {
                "id": str(doc["_id"]),
                "invoice_number": doc.get("invoice_number", ""),
                "sale_date": sale_date.isoformat() if isinstance(sale_date, datetime) else None,
                "days_ago": days_ago,
                "customer_name": doc.get("customer_name", ""),
                "customer_id": doc.get("customer_id"),
                "rate": doc.get("rate", 0),
                "quantity": doc.get("quantity", 0),
                "discount_percent": doc.get("discount_percent", 0),
            }
        )

    # ── Compute statistical suggestions ───────────────────────────────────────
    all_rates = [r["rate"] for r in global_history if r["rate"] > 0]

    last_customer_price = customer_history[0]["rate"] if customer_history else None
    last_global_price = global_history[0]["rate"] if global_history else None
    avg_customer_price = (
        round(sum(r["rate"] for r in customer_history) / len(customer_history), 2)
        if customer_history
        else None
    )
    avg_global_price = (
        round(sum(all_rates) / len(all_rates), 2) if all_rates else None
    )

    # Most-used price (mode)
    most_used_price = None
    if all_rates:
        from collections import Counter
        counter = Counter([round(r, 2) for r in all_rates])
        most_used_price = counter.most_common(1)[0][0]

    # Recommended = last customer price if available, else most used global, else default selling price
    recommended_price = (
        last_customer_price
        or most_used_price
        or avg_global_price
        or selling_price
    )

    suggestions = {
        "last_customer_price": last_customer_price,
        "avg_customer_price": avg_customer_price,
        "last_global_price": last_global_price,
        "avg_global_price": avg_global_price,
        "most_used_price": most_used_price,
        "recommended_price": recommended_price,
        "default_selling_price": selling_price,
    }

    return {
        "product_id": product_id,
        "product_name": product.get("name", ""),
        "purchase_price": purchase_price,
        "current_stock": current_stock,
        "mrp": mrp,
        "selling_price": selling_price,
        "customer_history": customer_history,
        "global_history": global_history,
        "suggestions": suggestions,
        "customer_label": customer_label,
    }
