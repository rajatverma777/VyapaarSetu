# Production Deployment Guide — VyapaarSetu

This guide details the complete deployment lifecycle for VyapaarSetu in a production multi-tenant cloud or on-premise high-availability environment.

---

## 1. Production Architecture Overview

```
                      Internet
                         │
                         ▼ (HTTPS: 443)
              ┌─────────────────────┐
              │     Nginx / Caddy   │  (SSL Termination, Rate Limiting,
              │    Reverse Proxy    │   Gzip/Brotli, Static Caching)
              └──────────┬──────────┘
                         │
        ┌────────────────┴────────────────┐
        ▼ (Port 80)                       ▼ (Port 8000)
┌──────────────┐                  ┌──────────────┐
│ React Frontend│                 │ FastAPI Monolith
│ Static / CDN │                  │ Uvicorn Cluster
└──────────────┘                  └──────┬───────┘
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
               ┌───────────────────┐           ┌───────────────────┐
               │  MongoDB Replica  │           │ Background Worker │
               │     Set (3-node)  │           │  Thread Pool      │
               │   ACID Transactions│          │  OCR / Fuzzy Sync │
               └───────────────────┘           └───────────────────┘
```

---

## 2. Infrastructure Requirements

| Component | Minimum (1-50 Stores) | Recommended (50-500 Stores) | High Scale (>500 Stores) |
| :--- | :--- | :--- | :--- |
| **App Server (CPU/RAM)** | 2 vCPU, 4 GB RAM | 4 vCPU, 8 GB RAM | 8+ vCPU, 16+ GB RAM (Multi-replica) |
| **MongoDB Cluster** | 3-node Replica Set (2 GB RAM each) | 3-node Replica Set (8 GB RAM each) | Sharded Cluster / MongoDB Atlas M30+ |
| **Storage** | 20 GB SSD | 100 GB NVMe SSD | Automated Scalable EBS / NVMe |
| **Network** | 100 Mbps | 1 Gbps | 10 Gbps |

---

## 3. Containerized Setup: Docker Compose

### `docker-compose.prod.yml`

```yaml
version: '3.8'

services:
  # 1. MongoDB 3-Node Replica Set
  mongo1:
    image: mongo:6.0
    container_name: vyapaar_mongo1
    restart: always
    command: ["mongod", "--replSet", "rs0", "--bind_ip_all", "--keyFile", "/data/replica.key"]
    volumes:
      - mongo1_data:/data/db
      - ./infra/mongo-keyfile:/data/replica.key:ro
    ports:
      - "27017:27017"

  # 2. FastAPI Backend Monolith
  backend:
    build:
      context: ./backend
      dockerFile: Dockerfile
    container_name: vyapaar_backend
    restart: always
    environment:
      - MONGODB_URL=mongodb://mongo1:27017/wholesale_erp?replicaSet=rs0
      - MONGODB_DB_NAME=wholesale_erp
      - SECRET_KEY=${SECRET_KEY}
      - ACCESS_TOKEN_EXPIRE_MINUTES=1440
      - DEBUG=False
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - CORS_ALLOWED_ORIGINS=https://app.vyapaarsetu.in
    volumes:
      - app_backups:/app/data/backups
      - app_docs:/app/data/documents
      - app_static:/app/static
    depends_on:
      - mongo1
    expose:
      - "8000"

  # 3. Frontend & Reverse Proxy
  web:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: vyapaar_web
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infra/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./infra/ssl:/etc/ssl/certs:ro
    depends_on:
      - backend

volumes:
  mongo1_data:
  app_backups:
  app_docs:
  app_static:
```

---

## 4. Initializing MongoDB Replica Set

MongoDB Replica Sets are required to support multi-document ACID transactions (`UnitOfWork`).

```bash
# Initialize replica set once container starts
docker exec -it vyapaar_mongo1 mongosh --eval '
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongo1:27017" }
  ]
})
'
```

---

## 5. Nginx Production Configuration

```nginx
server {
    listen 80;
    server_name app.vyapaarsetu.in;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.vyapaarsetu.in;

    ssl_certificate /etc/ssl/certs/fullchain.pem;
    ssl_certificate_key /etc/ssl/certs/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Client limits
    client_max_body_size 25M;

    # API Proxy
    location /api/ {
        proxy_pass http://backend:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90;
    }

    # Static Assets & Frontend App
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
        expires 1d;
    }
}
```

---

## 6. Health & Readiness Monitoring

The system exposes Kubernetes/Docker-compatible health probes:
- **Liveness Probe**: `GET /api/live` (Returns HTTP 200 if process event loop is active).
- **Readiness Probe**: `GET /api/ready` (Returns HTTP 200 only when MongoDB replica set ping succeeds; returns 503 otherwise).
- **Application Health**: `GET /api/health` (Reports application build version, database status, and active feature sets).

---

## 7. Zero-Downtime Rollout Strategy

1. **Deploy Database Migration**: Indexes and compound tenant keys created idempotently on startup.
2. **Rolling Backend Update**: Deploy new backend containers with `--wait` on `/api/ready`.
3. **Frontend CDN Cache Invalidation**: Deploy built Vite assets with content hashing (`assets/[name]-[hash].js`).
