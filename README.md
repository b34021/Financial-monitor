# RTM — Real-Time Financial Monitor

MVP של "Real-Time Financial Monitor": API קולט עסקאות, מעבד אותן ומשדר אותן
בזמן-אמת ללוח מחוונים (dashboard) חי — כולל היסטוריה מגובה-קאש על חיבור.

**Backend** = .NET 8 (Asp.NET Core minimal API) · **Frontend** = React + TypeScript
(Vite) · **Realtime** = SignalR · **Cache** = Redis (עם fallback ל-InMemory) · גרסה זו עובדת **HD-to-HD**.

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
- **Real-time:** עסקה חדשה שנקלטת נדחפת ללקוחות דרך SignalR hub (`/hubs/transactions`);
  על connect הלקוח מקבל היסטוריה (cache-backed) כ-`InitialTransactions`.
- **Cache:** `Redis` cache-aside + write-through; אם Redis לא זמין → שקוף fallback ל-InMemory.

## Quick Start (מקומי, ללא Docker)

1. **Backend** — Terminal 1:
   ```
   dotnet run --project src/RTM.Api      # → http://localhost:5248  (swagger)
   ```
2. **Frontend** — Terminal 2:
   ```
   cd client && npm install && npm run dev   # → http://localhost:5173
   ```
3. פועל: `/add` לשליחת עסקאות · `/monitor` ללוח חי + toggle "Show only errors".

## Docker (docker-compose)

דרישה: Docker Desktop במקום. מהשורש:
```
docker compose up --build
```
מריץ `backend` (תמונה multi-stage, port 8080) + `redis:7-alpine` (port 6379,
healthcheck). ה-backend מגיע עם env `Redis__Configuration=redis:6379`; אם Redis
לא זמין — האפליקציה עובדת על fallback InMemory.

בנייה ידנית:
```
docker build -f src/RTM.Api/Dockerfile -t rtmonitor-api .
```

## Kubernetes

Manifests בתיקיית [`k8s/`](k8s/): `deployment.yaml` (3 replicas + Service),
`redis.yaml` (Redis בפנים-קלאסטר). הרצה:
```
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/deployment.yaml
kubectl get pods -w        # 3/3 Ready כשהפרובבס עוברים
kubectl port-forward svc/rtmonitor-api 8080:8080
```
Probes (`/health`) → liveness + readiness. כל replica מפעיל hub מקומי; לסנכרון
תגובה בין מופעים — **ADR-003** (SignalR Redis Backplane).

**Redis backplane is now implemented and enabled via `SignalR:UseRedisBackplane=true`.**
The demo default (`false`) remains single-instance for simplicity. For multi-replica
deployments, set the flag to `true` (and provide a Redis endpoint via `SignalR:Redis`).

## תיעוד החלטות

- [`docs/ADR-001-redis-cache.md`](docs/ADR-001-redis-cache.md) — Redis cache + fallback InMemory.
- [`docs/ADR-002-signalr.md`](docs/ADR-002-signalr.md) — SignalR לשכבת הזמן-אמת.
- [`docs/ADR-003-signalr-redis-backplane.md`](docs/ADR-003-signalr-redis-backplane.md) — **סנכרון בין 5 מופעים**.
