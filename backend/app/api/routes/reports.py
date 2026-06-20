from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from app.core.database import get_database
from app.core.security import get_current_active_user, serialize_doc
from datetime import datetime, timedelta
from typing import Optional

router = APIRouter()

def date_range(from_date: Optional[str], to_date: Optional[str]):
    q = {}
    if from_date:
        q["$gte"] = datetime.fromisoformat(from_date)
    if to_date:
        q["$lte"] = datetime.fromisoformat(to_date + "T23:59:59")
    return q

@router.get("/dashboard")
async def dashboard_summary(
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    import asyncio
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    seven_days = today - timedelta(days=6)

    # Sales collection facet pipeline
    sales_pipeline = [
        {"$facet": {
            "today_sales": [
                {"$match": {"sale_date": {"$gte": today}, "sale_type": "sale"}},
                {"$group": {"_id": None, "total": {"$sum": "$total_amount"}, "count": {"$sum": 1}}}
            ],
            "recent_sales": [
                {"$match": {"sale_type": "sale"}},
                {"$sort": {"sale_date": -1}},
                {"$limit": 5},
                {"$project": {"invoice_number": 1, "customer_name": 1, "total_amount": 1, "sale_date": 1, "status": 1}}
            ],
            "sales_chart": [
                {"$match": {"sale_date": {"$gte": seven_days}, "sale_type": "sale"}},
                {"$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$sale_date"}},
                    "amount": {"$sum": "$total_amount"},
                    "count": {"$sum": 1}
                }},
                {"$sort": {"_id": 1}}
            ]
        }}
    ]

    # Customers collection facet pipeline
    customers_pipeline = [
        {"$facet": {
            "total_count": [
                {"$match": {"is_active": True}},
                {"$count": "count"}
            ],
            "outstanding": [
                {"$match": {"is_active": True, "current_balance": {"$gt": 0}}},
                {"$group": {"_id": None, "total": {"$sum": "$current_balance"}}}
            ]
        }}
    ]

    # Suppliers collection facet pipeline
    suppliers_pipeline = [
        {"$facet": {
            "total_count": [
                {"$match": {"is_active": True}},
                {"$count": "count"}
            ],
            "outstanding": [
                {"$match": {"is_active": True, "current_balance": {"$gt": 0}}},
                {"$group": {"_id": None, "total": {"$sum": "$current_balance"}}}
            ]
        }}
    ]

    # Products collection facet pipeline
    products_pipeline = [
        {"$facet": {
            "total_count": [
                {"$match": {"is_active": True}},
                {"$count": "count"}
            ],
            "low_stock_count": [
                {"$match": {
                    "is_active": True,
                    "$expr": {"$lte": ["$current_stock", "$min_stock_alert"]}
                }},
                {"$count": "count"}
            ]
        }}
    ]

    # Purchases collection aggregate pipeline
    pur_pipe = [
        {"$match": {"purchase_date": {"$gte": today}, "purchase_type": "purchase"}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}, "count": {"$sum": 1}}}
    ]

    # 1. Most sold brands
    brand_sales_pipe = [
        {"$match": {"sale_type": "sale"}},
        {"$unwind": "$items"},
        {"$addFields": {"items.product_id_obj": {"$toObjectId": "$items.product_id"}}},
        {"$lookup": {
            "from": "products",
            "localField": "items.product_id_obj",
            "foreignField": "_id",
            "as": "prod_info"
        }},
        {"$unwind": {"path": "$prod_info", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"brand": {"$ifNull": ["$prod_info.brand", "Unknown"]}}},
        {"$group": {
            "_id": "$brand",
            "revenue": {"$sum": "$items.total_amount"},
            "quantity": {"$sum": "$items.quantity"}
        }},
        {"$sort": {"quantity": -1}},
        {"$limit": 5}
    ]

    # 2. Most returned products
    returned_prod_pipe = [
        {"$match": {"type": "customer"}},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.product_id",
            "name": {"$first": "$items.product_name"},
            "quantity": {"$sum": "$items.quantity"},
            "value": {"$sum": "$items.total_amount"}
        }},
        {"$sort": {"quantity": -1}},
        {"$limit": 5}
    ]

    # 3. Most profitable brands
    profit_brand_pipe = [
        {"$match": {"sale_type": "sale"}},
        {"$unwind": "$items"},
        {"$addFields": {"items.product_id_obj": {"$toObjectId": "$items.product_id"}}},
        {"$lookup": {
            "from": "products",
            "localField": "items.product_id_obj",
            "foreignField": "_id",
            "as": "prod_info"
        }},
        {"$unwind": {"path": "$prod_info", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {
            "brand": {"$ifNull": ["$prod_info.brand", "Unknown"]},
            "purchase_price": {"$ifNull": ["$prod_info.purchase_price", 0.0]}
        }},
        {"$group": {
            "_id": "$brand",
            "revenue": {"$sum": "$items.total_amount"},
            "cost": {"$sum": {"$multiply": ["$items.quantity", "$purchase_price"]}}
        }},
        {"$project": {
            "brand": "$_id",
            "revenue": 1,
            "cost": 1,
            "profit": {"$subtract": ["$revenue", "$cost"]}
        }},
        {"$sort": {"profit": -1}},
        {"$limit": 5}
    ]

    # Execute all database operations concurrently
    sales_res, customers_res, suppliers_res, products_res, purchases_res, brand_res, returned_res, profit_res, recalls_res, movement_res = await asyncio.gather(
        db.sales.aggregate(sales_pipeline).to_list(1),
        db.customers.aggregate(customers_pipeline).to_list(1),
        db.suppliers.aggregate(suppliers_pipeline).to_list(1),
        db.products.aggregate(products_pipeline).to_list(1),
        db.purchases.aggregate(pur_pipe).to_list(1),
        db.sales.aggregate(brand_sales_pipe).to_list(5),
        db.returns.aggregate(returned_prod_pipe).to_list(5),
        db.sales.aggregate(profit_brand_pipe).to_list(5),
        db.recalls.find({"status": "active"}).sort("date", -1).limit(10).to_list(10),
        db.stock_logs.find().sort("created_at", -1).limit(5).to_list(5)
    )

    # Unpack Sales
    sales_facet = sales_res[0] if sales_res else {}
    today_sales_list = sales_facet.get("today_sales", [])
    today_sales = today_sales_list[0] if today_sales_list else {"total": 0, "count": 0}
    recent_sales = sales_facet.get("recent_sales", [])
    chart_data = sales_facet.get("sales_chart", [])

    # Unpack Customers
    cust_facet = customers_res[0] if customers_res else {}
    total_customers_list = cust_facet.get("total_count", [])
    total_customers = total_customers_list[0]["count"] if total_customers_list else 0
    cust_outstanding_list = cust_facet.get("outstanding", [])
    customer_outstanding = cust_outstanding_list[0]["total"] if cust_outstanding_list else 0

    # Unpack Suppliers
    sup_facet = suppliers_res[0] if suppliers_res else {}
    total_suppliers_list = sup_facet.get("total_count", [])
    total_suppliers = total_suppliers_list[0]["count"] if total_suppliers_list else 0
    sup_outstanding_list = sup_facet.get("outstanding", [])
    supplier_outstanding = sup_outstanding_list[0]["total"] if sup_outstanding_list else 0

    # Unpack Products
    prod_facet = products_res[0] if products_res else {}
    total_products_list = prod_facet.get("total_count", [])
    total_products = total_products_list[0]["count"] if total_products_list else 0
    low_stock_list = prod_facet.get("low_stock_count", [])
    low_stock = low_stock_list[0]["count"] if low_stock_list else 0

    # Unpack Purchases
    today_purchases = purchases_res[0] if purchases_res else {"total": 0, "count": 0}

    return {
        "today_sales": {"amount": today_sales.get("total", 0), "count": today_sales.get("count", 0)},
        "today_purchases": {"amount": today_purchases.get("total", 0), "count": today_purchases.get("count", 0)},
        "total_customers": total_customers,
        "total_suppliers": total_suppliers,
        "total_products": total_products,
        "customer_outstanding": round(customer_outstanding, 2),
        "supplier_outstanding": round(supplier_outstanding, 2),
        "low_stock_count": low_stock,
        "recent_sales": [serialize_doc(s) for s in recent_sales],
        "sales_chart": chart_data,
        "most_sold_brands": [{"brand": b["_id"], "revenue": b["revenue"], "quantity": b["quantity"]} for b in brand_res],
        "most_returned_products": [{"id": p["_id"], "name": p["name"], "quantity": p["quantity"], "value": p["value"]} for p in returned_res],
        "most_profitable_brands": [{"brand": b["brand"], "revenue": b["revenue"], "profit": b["profit"]} for b in profit_res],
        "batch_recall_alerts": [serialize_doc(r) for r in recalls_res],
        "product_movement_history": [serialize_doc(l) for l in movement_res]
    }

@router.get("/sales")
async def sales_report(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    customer_id: Optional[str] = Query(None),
    group_by: str = Query("day"),  # day, month, customer, product
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    match = {"sale_type": "sale"}
    dr = date_range(from_date, to_date)
    if dr:
        match["sale_date"] = dr
    if customer_id:
        match["customer_id"] = customer_id

    if group_by == "day":
        group_id = {"$dateToString": {"format": "%Y-%m-%d", "date": "$sale_date"}}
    elif group_by == "month":
        group_id = {"$dateToString": {"format": "%Y-%m", "date": "$sale_date"}}
    elif group_by == "customer":
        group_id = "$customer_name"
    else:
        group_id = {"$dateToString": {"format": "%Y-%m-%d", "date": "$sale_date"}}

    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": group_id,
            "total_amount": {"$sum": "$total_amount"},
            "total_tax": {"$sum": "$total_tax"},
            "taxable_amount": {"$sum": "$taxable_amount"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    data = await db.sales.aggregate(pipeline).to_list(1000)

    # Summary
    summary_pipe = [
        {"$match": match},
        {"$group": {
            "_id": None,
            "total_amount": {"$sum": "$total_amount"},
            "total_tax": {"$sum": "$total_tax"},
            "total_cgst": {"$sum": "$total_cgst"},
            "total_sgst": {"$sum": "$total_sgst"},
            "total_igst": {"$sum": "$total_igst"},
            "taxable_amount": {"$sum": "$taxable_amount"},
            "total_paid": {"$sum": "$paid_amount"},
            "outstanding": {"$sum": "$balance_amount"},
            "count": {"$sum": 1}
        }}
    ]
    summary = await db.sales.aggregate(summary_pipe).to_list(1)
    return {
        "data": data,
        "summary": summary[0] if summary else {}
    }

@router.get("/purchases")
async def purchases_report(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    supplier_id: Optional[str] = Query(None),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    match = {"purchase_type": "purchase"}
    dr = date_range(from_date, to_date)
    if dr:
        match["purchase_date"] = dr
    if supplier_id:
        match["supplier_id"] = supplier_id

    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$purchase_date"}},
            "total_amount": {"$sum": "$total_amount"},
            "total_tax": {"$sum": "$total_tax"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    data = await db.purchases.aggregate(pipeline).to_list(1000)

    summary_pipe = [
        {"$match": match},
        {"$group": {
            "_id": None,
            "total_amount": {"$sum": "$total_amount"},
            "total_tax": {"$sum": "$total_tax"},
            "total_cgst": {"$sum": "$total_cgst"},
            "total_sgst": {"$sum": "$total_sgst"},
            "total_igst": {"$sum": "$total_igst"},
            "total_paid": {"$sum": "$paid_amount"},
            "outstanding": {"$sum": "$balance_amount"},
            "count": {"$sum": 1}
        }}
    ]
    summary = await db.purchases.aggregate(summary_pipe).to_list(1)
    return {"data": data, "summary": summary[0] if summary else {}}

@router.get("/gst-summary")
async def gst_summary_report(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    dr = date_range(from_date, to_date)

    # Sales GST
    sales_match = {"sale_type": "sale"}
    if dr:
        sales_match["sale_date"] = dr

    sales_gst_pipe = [
        {"$match": sales_match},
        {"$group": {
            "_id": None,
            "taxable": {"$sum": "$taxable_amount"},
            "cgst": {"$sum": "$total_cgst"},
            "sgst": {"$sum": "$total_sgst"},
            "igst": {"$sum": "$total_igst"},
            "total_tax": {"$sum": "$total_tax"}
        }}
    ]
    sales_gst = await db.sales.aggregate(sales_gst_pipe).to_list(1)

    # Purchase GST
    pur_match = {"purchase_type": "purchase"}
    if dr:
        pur_match["purchase_date"] = dr

    pur_gst_pipe = [
        {"$match": pur_match},
        {"$group": {
            "_id": None,
            "taxable": {"$sum": "$taxable_amount"},
            "cgst": {"$sum": "$total_cgst"},
            "sgst": {"$sum": "$total_sgst"},
            "igst": {"$sum": "$total_igst"},
            "total_tax": {"$sum": "$total_tax"}
        }}
    ]
    pur_gst = await db.purchases.aggregate(pur_gst_pipe).to_list(1)

    # HSN-wise sales
    hsn_pipe = [
        {"$match": sales_match},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.hsn_code",
            "taxable": {"$sum": "$items.taxable_amount"},
            "cgst": {"$sum": "$items.cgst_amount"},
            "sgst": {"$sum": "$items.sgst_amount"},
            "igst": {"$sum": "$items.igst_amount"},
            "quantity": {"$sum": "$items.quantity"}
        }},
        {"$sort": {"taxable": -1}}
    ]
    hsn_data = await db.sales.aggregate(hsn_pipe).to_list(1000)

    s = sales_gst[0] if sales_gst else {}
    p = pur_gst[0] if pur_gst else {}

    return {
        "sales_gst": {
            "taxable": round(s.get("taxable", 0), 2),
            "cgst": round(s.get("cgst", 0), 2),
            "sgst": round(s.get("sgst", 0), 2),
            "igst": round(s.get("igst", 0), 2),
            "total_tax": round(s.get("total_tax", 0), 2)
        },
        "purchase_gst": {
            "taxable": round(p.get("taxable", 0), 2),
            "cgst": round(p.get("cgst", 0), 2),
            "sgst": round(p.get("sgst", 0), 2),
            "igst": round(p.get("igst", 0), 2),
            "total_tax": round(p.get("total_tax", 0), 2)
        },
        "net_gst_liability": {
            "cgst": round(s.get("cgst", 0) - p.get("cgst", 0), 2),
            "sgst": round(s.get("sgst", 0) - p.get("sgst", 0), 2),
            "igst": round(s.get("igst", 0) - p.get("igst", 0), 2),
        },
        "hsn_wise": hsn_data
    }

@router.get("/profit-loss")
async def profit_loss_report(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    dr = date_range(from_date, to_date)
    sales_match = {"sale_type": "sale"}
    if dr:
        sales_match["sale_date"] = dr

    # Revenue
    rev_pipe = [
        {"$match": sales_match},
        {"$group": {"_id": None, "revenue": {"$sum": "$total_amount"}, "tax": {"$sum": "$total_tax"}}}
    ]
    rev = await db.sales.aggregate(rev_pipe).to_list(1)
    revenue = rev[0].get("revenue", 0) if rev else 0
    sales_tax = rev[0].get("tax", 0) if rev else 0

    # COGS - approximate from stock logs
    cogs_pipe = [
        {"$match": {"type": "sale"}},
        {"$lookup": {
            "from": "products",
            "localField": "product_id",
            "foreignField": "_id",
            "as": "product"
        }},
        {"$unwind": "$product"},
        {"$group": {
            "_id": None,
            "cogs": {"$sum": {"$multiply": [{"$abs": "$quantity"}, "$product.purchase_price"]}}
        }}
    ]
    cogs_res = await db.stock_logs.aggregate(cogs_pipe).to_list(1)
    cogs = cogs_res[0].get("cogs", 0) if cogs_res else 0

    gross_profit = revenue - sales_tax - cogs
    gross_margin = (gross_profit / (revenue - sales_tax) * 100) if (revenue - sales_tax) > 0 else 0

    return {
        "revenue": round(revenue, 2),
        "sales_tax": round(sales_tax, 2),
        "net_revenue": round(revenue - sales_tax, 2),
        "cogs": round(cogs, 2),
        "gross_profit": round(gross_profit, 2),
        "gross_margin_percent": round(gross_margin, 2)
    }

@router.get("/stock")
async def stock_report(
    category_id: Optional[str] = Query(None),
    low_stock_only: bool = Query(False),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    match = {"is_active": True}
    if category_id:
        match["category_id"] = category_id
    if low_stock_only:
        match["$expr"] = {"$lte": ["$current_stock", "$min_stock_alert"]}

    pipeline = [
        {"$match": match},
        {"$lookup": {
            "from": "categories",
            "let": {"cat_id": {"$toObjectId": "$category_id"}},
            "pipeline": [{"$match": {"$expr": {"$eq": ["$_id", "$$cat_id"]}}}],
            "as": "category"
        }},
        {"$addFields": {
            "category_name": {"$ifNull": [{"$arrayElemAt": ["$category.name", 0]}, ""]},
            "stock_value": {"$multiply": ["$current_stock", "$purchase_price"]}
        }},
        {"$project": {"category": 0}},
        {"$sort": {"name": 1}}
    ]
    products = await db.products.aggregate(pipeline).to_list(10000)

    total_value = sum(p.get("stock_value", 0) for p in products)
    return {
        "products": [serialize_doc(p) for p in products],
        "total_value": round(total_value, 2),
        "total_items": len(products)
    }

@router.get("/outstanding")
async def outstanding_report(
    party_type: str = Query("customer"),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    collection = db.customers if party_type == "customer" else db.suppliers
    parties = await collection.find(
        {"is_active": True, "current_balance": {"$gt": 0}}
    ).sort("current_balance", -1).to_list(1000)

    total = sum(p.get("current_balance", 0) for p in parties)
    return {
        "parties": [serialize_doc(p) for p in parties],
        "total_outstanding": round(total, 2)
    }

@router.get("/product-wise-sales")
async def product_wise_sales(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    limit: int = Query(50),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    match = {"sale_type": "sale"}
    dr = date_range(from_date, to_date)
    if dr:
        match["sale_date"] = dr

    pipeline = [
        {"$match": match},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.product_id",
            "product_name": {"$first": "$items.product_name"},
            "total_qty": {"$sum": "$items.quantity"},
            "total_amount": {"$sum": "$items.total_amount"},
            "total_taxable": {"$sum": "$items.taxable_amount"}
        }},
        {"$sort": {"total_amount": -1}},
        {"$limit": limit}
    ]
    data = await db.sales.aggregate(pipeline).to_list(limit)
    return data
