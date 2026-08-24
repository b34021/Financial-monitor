# RTM — Real-Time Financial Monitor

MVP of a "Real-Time Financial Monitor": an API that ingests transactions, processes them,
and streams them in real-time to a live dashboard — including cache-backed history on connect.

**Backend** = .NET 8 (ASP.NET Core minimal API) · **Frontend** = React + TypeScript
(Vite) · **Realtime** = SignalR · **Cache** = Redis (with fallback to InMemory).

## Architecture

```
                  ┌──────────────────────────────┐
   /add  ─POST──▶ │  RTM.Api  (.NET 8)           │
   simulator      │  Api  →  Services  →  Core   │
                  │     ⛳  Redis (cache-aside)   │
                  │        SignalR (hub)         │
                  └───────┬──────────┬───────────┘
                 history  │          │ live push
        /health  /hubs/transactions  │
                  ┌───────▼──────────▼───────────┐
   /monitor ─────▶│  React client  (Vite :5173)  │
   dashboard      │  proxy /api + /hubs → 5248   │
                  └──────────────────────────────┘
```

- **Layers:** `Api → Services → Core` (Rules), Dependency Injection, **Result pattern**,
  `CancellationToken`, Nullability + `TreatWarningsAsErrors`.
- **Real-time:** a new ingested transaction is pushed to clients via the SignalR hub (`/hubs/transactions`);
  on connect, the client receives cache-backed history as `InitialTransactions`.
- **Cache:** Redis cache-aside: reads check the cache first; on a miss, the transaction store
  is queried and the result is cached. After a new transaction is persisted, the cached list
  is invalidated (write-invalidate). If Redis is unavailable → transparent InMemory fallback.

## Quick Start (Local, without Docker)

1. **Backend** — Terminal 1:
   ```
   dotnet run --project server/src/RTM.Api      # → http://localhost:5248  (swagger)
   ```
2. **Frontend** — Terminal 2:
   ```
   cd client && npm install && npm run dev   # → http://localhost:5173
   ```
3. Ready: `/add` to send transactions · `/monitor` for the live dashboard + toggle "Show only errors".

## Testing

Run the automated checks for both parts of the stack:

```
# Backend — unit + integration tests (xUnit, see server/tests/RTM.Tests)
dotnet test

# Frontend — type-check + lint
cd client && npm run lint

# Frontend — production build
cd client && npm run build
```

## Docker (docker-compose)

Requirement: Docker Desktop installed. From the project root:
```
docker compose up --build
```
Runs `backend` (multi-stage image, port 8080) + `redis:7-alpine` (port 6379,
healthcheck). The backend is configured with env `Redis__Configuration=redis:6379`; if Redis
is unavailable — the application falls back to InMemory.

Build manually:
```
docker build -f server/src/RTM.Api/Dockerfile -t rtmonitor-api .
```

## Kubernetes

Manifests in the [`k8s/`](k8s/) directory: [`deployment.yaml`](k8s/deployment.yaml) (3 replicas + Service — the Service is included in the same file), [`redis.yaml`](k8s/redis.yaml) (in-cluster Redis). Run:
```
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/deployment.yaml
kubectl get pods -w        # 3/3 Ready when probes pass
kubectl port-forward svc/rtmonitor-api 8080:8080
```
Probes (`/health`) → liveness + readiness. Each replica hosts its own SignalR hub instance;
the Redis backplane distributes SignalR messages across replicas — **ADR-003** (SignalR Redis Backplane).

**Redis backplane is now implemented and enabled via `SignalR:UseRedisBackplane=true`.**
The demo default (`false`) remains single-instance for simplicity. For multi-replica
deployments, set the flag to `true` (and provide a Redis endpoint via `SignalR:Redis`).

## Decision Records

- [`docs/ADR-001-redis-cache.md`](docs/ADR-001-redis-cache.md) — Redis cache + fallback InMemory.
- [`docs/ADR-002-signalr.md`](docs/ADR-002-signalr.md) — SignalR for the real-time layer.
- [`docs/ADR-003-signalr-redis-backplane.md`](docs/ADR-003-signalr-redis-backplane.md) — **SignalR message distribution across multiple replicas**.

## Security Considerations

Security was considered during the design of the MVP.

Authentication and authorization (OAuth2/OIDC, JWT, roles and permissions)
were intentionally deferred to keep the MVP focused on the core requirement:
real-time transaction ingestion and live dashboard delivery. These are
outside the scope of this assignment.

The API boundary is still treated as untrusted input. Transaction requests
are received through dedicated DTOs and validated before entering the
application/business layer. This prevents over-posting and ensures a clear
API contract.

For a production deployment, I would additionally introduce:

- Authentication and Authorization using OAuth2/OIDC with JWT Bearer tokens.
- Authorization for both the HTTP API and SignalR Hub.
- Strict CORS configuration.
- HTTPS/WSS enforcement.
- Rate limiting on the ingestion endpoint.
- Secure secret management (Azure Key Vault / Kubernetes Secrets).
- Protected Redis connectivity (TLS, password, network policies).
- Security-focused logging and monitoring.

This keeps the MVP focused on the assignment's core requirements while
providing a clear path toward production hardening.

**Data Storage Decision**

Transactions are stored in-memory (`ConcurrentDictionary`, thread-safe) rather than SQLite.

**Why RAM, not SQLite?**

| Concern | RAM | SQLite |
|---|---|---|
| Latency | ✅ Very low | ⚠️ Higher (disk I/O) |
| Single replica MVP | ✅ Simple, fast | ✅ Works |
| Multiple replicas | ❌ Per-pod state | ❌ Same problem (local file per pod) |
| Production distributed | ❌ | ❌ |

Both RAM and a local SQLite database are process/node-local storage options and
therefore do not provide shared transaction state across replicas.
For production horizontal scaling, transaction state should be moved to a
shared durable store such as PostgreSQL. Redis remains appropriate for
distributed caching and the SignalR backplane.

The storage is abstracted behind `ITransactionStore` interface. Replacing it with a shared database (PostgreSQL) requires changing one implementation.