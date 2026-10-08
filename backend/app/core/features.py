"""
Feature Flags & SaaS Subscription Plan Limits for VyapaarSetu.
Enables feature rollouts, tiered licensing, and business guardrails without requiring codebase rewrites.
"""
from enum import Enum
from typing import Dict, Any, Optional

class FeatureFlag(str, Enum):
    AI_COPILOT = "ai_copilot"
    OCR_IMPORT = "ocr_import"
    MULTI_STORE = "multi_store"
    ADVANCED_REPORTS = "advanced_reports"
    WHATSAPP = "whatsapp"
    E_INVOICE = "e_invoice"
    BANK_RECONCILIATION = "bank_reconciliation"
    FEFO_INVENTORY = "fefo_inventory"
    BATCH_EXPIRY_TRACKING = "batch_expiry_tracking"

class SubscriptionPlan(str, Enum):
    FREE = "free"
    STANDARD = "standard"
    ENTERPRISE = "enterprise"

PLAN_LIMITS: Dict[str, Dict[str, Any]] = {
    SubscriptionPlan.FREE.value: {
        "max_products": 100,
        "max_users": 2,
        "max_stores": 1,
        "max_monthly_invoices": 150,
        "max_monthly_ocr": 15,
        "features": [
            FeatureFlag.BATCH_EXPIRY_TRACKING.value,
        ]
    },
    SubscriptionPlan.STANDARD.value: {
        "max_products": 2500,
        "max_users": 10,
        "max_stores": 3,
        "max_monthly_invoices": 3000,
        "max_monthly_ocr": 300,
        "features": [
            FeatureFlag.BATCH_EXPIRY_TRACKING.value,
            FeatureFlag.FEFO_INVENTORY.value,
            FeatureFlag.OCR_IMPORT.value,
            FeatureFlag.ADVANCED_REPORTS.value,
            FeatureFlag.WHATSAPP.value,
        ]
    },
    SubscriptionPlan.ENTERPRISE.value: {
        "max_products": 100000,
        "max_users": 100,
        "max_stores": 25,
        "max_monthly_invoices": 100000,
        "max_monthly_ocr": 5000,
        "features": [
            FeatureFlag.AI_COPILOT.value,
            FeatureFlag.OCR_IMPORT.value,
            FeatureFlag.MULTI_STORE.value,
            FeatureFlag.ADVANCED_REPORTS.value,
            FeatureFlag.WHATSAPP.value,
            FeatureFlag.E_INVOICE.value,
            FeatureFlag.BANK_RECONCILIATION.value,
            FeatureFlag.FEFO_INVENTORY.value,
            FeatureFlag.BATCH_EXPIRY_TRACKING.value,
        ]
    }
}

class FeatureManager:
    @staticmethod
    def is_feature_enabled(
        feature: FeatureFlag | str,
        plan: str = SubscriptionPlan.ENTERPRISE.value,
        tenant_overrides: Optional[Dict[str, bool]] = None
    ) -> bool:
        feature_name = feature.value if isinstance(feature, FeatureFlag) else str(feature)
        
        # Check tenant-specific override first
        if tenant_overrides and feature_name in tenant_overrides:
            return bool(tenant_overrides[feature_name])
            
        plan_config = PLAN_LIMITS.get(plan, PLAN_LIMITS[SubscriptionPlan.ENTERPRISE.value])
        return feature_name in plan_config.get("features", [])

    @staticmethod
    def get_plan_limits(plan: str = SubscriptionPlan.STANDARD.value) -> Dict[str, Any]:
        return PLAN_LIMITS.get(plan, PLAN_LIMITS[SubscriptionPlan.STANDARD.value])
