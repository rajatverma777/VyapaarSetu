from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import get_database
from app.core.security import get_current_active_user, serialize_doc, require_permission
from bson import ObjectId
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

router = APIRouter()

class RecallCreate(BaseModel):
    batch_no: str
    reason: str
    notes: Optional[str] = None

@router.get("/brand")
async def get_brand_analytics(
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    # Fetch all unique brand names from products
    distinct_brands = await db.products.distinct("brand")
    product_brands = set()
    for b in distinct_brands:
        if b and b.strip() and b.lower() not in ("none", "nan", "unknown", "n/a"):
            product_brands.add(b.strip())

    pipeline = [
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
            "_id": {
                "brand": "$brand",
                "customer_id": "$customer_id",
                "customer_name": "$customer_name"
            },
            "revenue": {"$sum": "$items.total_amount"},
            "quantity": {"$sum": "$items.quantity"}
        }}
    ]
    
    raw_res = await db.sales.aggregate(pipeline).to_list(None)
    
    # Process brand-wise aggregation and customer spent
    brands_data = {}
    
    # Pre-populate with all known product brands
    for brand in product_brands:
        brands_data[brand] = {
            "brand": brand,
            "revenue": 0.0,
            "quantity": 0.0,
            "customers": {}
        }
        
    for item in raw_res:
        brand = item["_id"]["brand"]
        brand_clean = brand.strip() if brand else ""
        if not brand_clean or brand_clean.lower() in ("none", "nan", "unknown", "n/a"):
            continue
            
        cust_id = item["_id"]["customer_id"]
        cust_name = item["_id"]["customer_name"]
        rev = item["revenue"]
        qty = item["quantity"]
        
        if brand_clean not in brands_data:
            brands_data[brand_clean] = {
                "brand": brand_clean,
                "revenue": 0.0,
                "quantity": 0.0,
                "customers": {}
            }
            
        brands_data[brand_clean]["revenue"] += rev
        brands_data[brand_clean]["quantity"] += qty
        
        if cust_id:
            if cust_id not in brands_data[brand_clean]["customers"]:
                brands_data[brand_clean]["customers"][cust_id] = {
                    "customer_id": cust_id,
                    "customer_name": cust_name,
                    "revenue": 0.0,
                    "quantity": 0.0
                }
            brands_data[brand_clean]["customers"][cust_id]["revenue"] += rev
            brands_data[brand_clean]["customers"][cust_id]["quantity"] += qty

    # Format output and sort top customers
    formatted = []
    for brand, val in brands_data.items():
        cust_list = list(val["customers"].values())
        cust_list.sort(key=lambda x: x["revenue"], reverse=True)
        formatted.append({
            "brand": brand,
            "revenue": round(val["revenue"], 2),
            "quantity": val["quantity"],
            "top_customers": cust_list[:5]  # Top 5 customers per brand
        })
        
    # Sort: brands with sales (revenue > 0) descending by revenue, followed by brands with 0 sales alphabetically
    formatted.sort(key=lambda x: (x["revenue"] == 0, -x["revenue"], x["brand"].lower()))
    return formatted

@router.get("/product/{product_id}")
async def get_product_traceability(
    product_id: str,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    # Track every customer purchase history of a product
    # Find all sales invoices containing this product
    pipeline = [
        {"$match": {"sale_type": "sale", "items.product_id": product_id}},
        {"$unwind": "$items"},
        {"$match": {"items.product_id": product_id}},
        {"$project": {
            "invoice_number": 1,
            "customer_id": 1,
            "customer_name": 1,
            "sale_date": 1,
            "quantity": "$items.quantity",
            "rate": "$items.rate",
            "total_amount": "$items.total_amount",
            "batch_no": "$items.batch_no"
        }},
        {"$sort": {"sale_date": -1}}
    ]
    
    invoices = await db.sales.aggregate(pipeline).to_list(None)
    
    # Calculate customer-wise quantities
    cust_totals = {}
    for inv in invoices:
        cid = inv.get("customer_id") or "Walk-in"
        cname = inv["customer_name"]
        qty = inv["quantity"]
        
        if cid not in cust_totals:
            cust_totals[cid] = {"customer_name": cname, "total_qty": 0.0, "invoice_count": 0}
        cust_totals[cid]["total_qty"] += qty
        cust_totals[cid]["invoice_count"] += 1

    return {
        "product_id": product_id,
        "customer_summary": list(cust_totals.values()),
        "purchase_history": [serialize_doc(i) for i in invoices]
    }

@router.get("/batch/{batch_no}")
async def get_batch_traceability(
    batch_no: str,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    # Track batch number from purchase to final sale.
    # 1. Get Purchase Sourcing info
    purchase_pipe = [
        {"$match": {"purchase_type": "purchase", "items.batch_no": batch_no}},
        {"$unwind": "$items"},
        {"$match": {"items.batch_no": batch_no}},
        {"$project": {
            "invoice_number": 1,
            "sys_invoice_number": 1,
            "supplier_id": 1,
            "supplier_name": 1,
            "purchase_date": 1,
            "product_id": "$items.product_id",
            "product_name": "$items.product_name",
            "quantity": "$items.quantity",
            "rate": "$items.rate"
        }},
        {"$sort": {"purchase_date": -1}}
    ]
    purchases = await db.purchases.aggregate(purchase_pipe).to_list(None)

    # 2. Get Sales Distribution info
    sales_pipe = [
        {"$match": {
            "sale_type": "sale",
            "$or": [
                {"items.batch_no": batch_no},
                {"items.batches_allocated.batch_no": batch_no}
            ]
        }},
        {"$unwind": "$items"},
        {"$match": {
            "$or": [
                {"items.batch_no": batch_no},
                {"items.batches_allocated.batch_no": batch_no}
            ]
        }},
        {"$project": {
            "invoice_number": 1,
            "customer_id": 1,
            "customer_name": 1,
            "sale_date": 1,
            "product_id": "$items.product_id",
            "product_name": "$items.product_name",
            "quantity": "$items.quantity",
            "rate": "$items.rate",
            "batches_allocated": "$items.batches_allocated"
        }},
        {"$sort": {"sale_date": -1}}
    ]
    sales = await db.sales.aggregate(sales_pipe).to_list(None)

    # Clean quantities for multi-batch allocation sales
    for s in sales:
        allocated = s.get("batches_allocated")
        if allocated:
            for b in allocated:
                if b["batch_no"] == batch_no:
                    s["quantity"] = b["quantity"]
                    break

    # Get active batch details
    batch_info = await db.batches.find({"batch_no": batch_no}).to_list(None)

    return {
        "batch_no": batch_no,
        "batch_details": [serialize_doc(b) for b in batch_info],
        "sourcing": [serialize_doc(p) for p in purchases],
        "distribution": [serialize_doc(s) for s in sales]
    }

@router.post("/recall")
async def initiate_batch_recall(
    data: RecallCreate,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_create_purchases"))
):
    # 1. Fetch recall list of affected customers
    sales_pipe = [
        {"$match": {
            "sale_type": "sale",
            "$or": [
                {"items.batch_no": data.batch_no},
                {"items.batches_allocated.batch_no": data.batch_no}
            ]
        }},
        {"$unwind": "$items"},
        {"$match": {
            "$or": [
                {"items.batch_no": data.batch_no},
                {"items.batches_allocated.batch_no": data.batch_no}
            ]
        }}
    ]
    sales = await db.sales.aggregate(sales_pipe).to_list(None)

    affected_cust_ids = list(set([s["customer_id"] for s in sales if s.get("customer_id")]))
    
    customers_info = []
    if affected_cust_ids:
        cust_objs = [ObjectId(cid) for cid in affected_cust_ids]
        customers_info = await db.customers.find({"_id": {"$in": cust_objs}}).to_list(None)

    # Generate contact list
    contact_list = []
    for c in customers_info:
        addr = c.get("address", {})
        addr_str = ""
        if isinstance(addr, dict):
            addr_str = ", ".join([addr[k] for k in ["street", "city", "state", "pincode"] if addr.get(k)])
        elif isinstance(addr, str):
            addr_str = addr

        contact_list.append({
            "customer_id": str(c["_id"]),
            "customer_name": c["name"],
            "mobile": c.get("mobile", "N/A"),
            "email": c.get("email", "N/A"),
            "address": addr_str
        })

    # Save recall record
    recall_doc = {
        "batch_no": data.batch_no,
        "reason": data.reason,
        "notes": data.notes,
        "date": datetime.utcnow(),
        "status": "active",
        "affected_customers_count": len(contact_list),
        "created_by": str(current_user["_id"]),
        "created_at": datetime.utcnow()
    }
    result = await db.recalls.insert_one(recall_doc)
    recall_id = str(result.inserted_id)

    # Audit log
    await db.audit_logs.insert_one({
        "action": "RECALL_INITIATED",
        "details": f"Batch recall initiated for batch '{data.batch_no}'. Reason: {data.reason}. Identified {len(contact_list)} affected customers.",
        "reference_id": recall_id,
        "created_by": str(current_user["_id"]),
        "created_by_name": current_user.get("full_name", ""),
        "created_at": datetime.utcnow()
    })

    return {
        "message": "Recall successfully initiated",
        "recall_id": recall_id,
        "affected_customers": contact_list
    }

@router.get("/recalls")
async def list_recalls(
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    recalls = await db.recalls.find().sort("date", -1).to_list(None)
    return [serialize_doc(r) for r in recalls]

@router.get("/brand/sales")
async def get_brand_sales_details(
    brand: str = Query(...),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    import re
    # Find all sales for products matching this brand
    pipeline = [
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
        {"$match": {"brand": {"$regex": f"^{re.escape(brand.strip())}$", "$options": "i"}}},
        {"$project": {
            "invoice_number": 1,
            "customer_name": 1,
            "sale_date": 1,
            "product_name": "$items.product_name",
            "quantity": "$items.quantity",
            "rate": "$items.rate",
            "total_amount": "$items.total_amount",
            "batch_no": "$items.batch_no"
        }},
        {"$sort": {"sale_date": -1}}
    ]
    results = await db.sales.aggregate(pipeline).to_list(None)
    return [serialize_doc(r) for r in results]
