# Disaster Recovery & Business Continuity Plan — VyapaarSetu

This document defines the Disaster Recovery (DR) runbook, automated backup architecture, and continuity procedures for VyapaarSetu.

---

## 1. Objectives & Metrics

| Metric | Target | Description |
| :--- | :--- | :--- |
| **Recovery Point Objective (RPO)** | **< 1 Hour** | In the event of a catastrophic disaster, at most 1 hour of transactional data may be reconstructed from write-ahead logs. |
| **Recovery Time Objective (RTO)** | **< 15 Minutes** | Full system availability restored and operational within 15 minutes of outage declaration. |
| **Data Retention** | **7 Years** | Mandatory compliance for Indian GST audit trails and accounting records. |

---

## 2. Backup Architecture

```
[ Active MongoDB Cluster ]
          │
          ├──► Daily Tenant Zip Snapshots (Automated Cron / AES-256)
          │         └──► Stored in private directory: data/backups/
          │
          ├──► Continuous Oplog Archival (Point-In-Time Recovery)
          │
          └──► Secondary Off-Site Sync (AWS S3 Glacier / Cloud Storage Bucket)
```

### Storage Protection Rules:
1. Backups are stored in `data/backups/`, strictly **outside** the web-accessible root.
2. Backups contain only the tenant's data (`tenant_id` scope isolation). Global collections (e.g. system accounts) are never mixed into tenant archives.
3. Every backup generation creates a SHA-256 checksum file to detect bit rot or tampering before restore.

---

## 3. Failure Scenarios & Recovery Procedures

### Scenario A: Accidental Data Deletion or Tenant Corrupted Invoices
- **Symptoms**: Tenant reports accidental customer/sale deletion or incorrect batch ledger entries.
- **Recovery Procedure**:
  1. Identify tenant ID from user profile: `tenant_id = "org_xyz"`.
  2. Locate latest healthy snapshot in `data/backups/`:
     ```bash
     ls -lt data/backups/backup_org_xyz_*.zip | head -n 1
     ```
  3. Authenticated Admin invokes restore endpoint:
     ```bash
     curl -X POST https://api.vyapaarsetu.in/api/backup/restore \
       -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
       -F "file=@data/backups/backup_org_xyz_20261008.zip"
     ```
  4. The system restores collections inside an atomic session, replacing corrupted records and rebuilding compound tenant indexes.

### Scenario B: Primary MongoDB Node Failure
- **Symptoms**: API returns 503 `/api/ready` errors or database connection drops.
- **Automatic Failover**:
  1. The 3-node MongoDB Replica Set initiates automatic election within 3-5 seconds.
  2. A healthy secondary becomes primary.
  3. Uvicorn connections reconnect automatically via connection string topology discovery (`retryWrites=true`).

### Scenario C: Complete Data Center / Infrastructure Outage
- **Symptoms**: Host server completely unresponsive or hardware destroyed.
- **Runbook**:
  1. Provision standby instance on secondary cloud region (or local on-premise fallback).
  2. Pull the latest encrypted backup archive from remote off-site cloud storage.
  3. Deploy stack via Docker Compose:
     ```bash
     docker compose -f docker-compose.prod.yml up -d
     ```
  4. Run automated database restore script:
     ```bash
     python3 scripts/restore_all_tenants.py --source /mnt/disaster-backup/
     ```
  5. Verify health check: `curl -f https://app.vyapaarsetu.in/api/health`.
  6. Switch DNS records in Cloudflare to new IP.

---

## 4. Disaster Recovery Testing Cadence
- **Weekly Automated Verification**: Test script restores a randomized tenant backup into an ephemeral test database to confirm 100% unpack and deserialize integrity.
- **Quarterly Tabletop Simulation**: Team simulates total primary region failure and documents RTO/RPO actuals.
