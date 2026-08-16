# Production deploy — Ubuntu + Docker

Isolated stack for this project only: `bm-api` + `bm-mongo` on Docker network `building-management_internal`. Mongo is not published on the host. The API is published on **host port 3011** so it will not collide with other apps on `80`/`443`.

Target VPS: `64.176.81.197`

GitHub: https://github.com/coder-jubayer/building-management

## 1. Server one-time setup

SSH in as a user that can run Docker (not required to be root for compose once Docker is installed):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git ufw

# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out and back in so the docker group applies
```

Allow only SSH and this app’s HTTP port (add 80/443 later if you put nginx/Caddy in front):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3011/tcp
sudo ufw enable
```

Do **not** open Mongo on the public firewall. It only listens inside Docker.

## 2. Clone and configure

```bash
sudo mkdir -p /opt/building-management
sudo chown "$USER":"$USER" /opt/building-management
cd /opt/building-management
git clone https://github.com/coder-jubayer/building-management.git .
cp deploy/env.example .env
nano .env
```

Set at least:

- `MONGO_ROOT_PASSWORD` — letters/numbers only (special characters break the Mongo URI)
- `JWT_SECRET` — `openssl rand -hex 32`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — first app admin
- `API_URL=http://64.176.81.197:3011`

## 3. Start the isolated stack

```bash
cd /opt/building-management
docker compose --env-file .env up -d --build
docker compose ps
curl http://127.0.0.1:3011/api/v1/health
curl http://64.176.81.197:3011/api/v1/health
```

Useful commands (only this project):

```bash
docker compose logs -f api
docker compose logs -f mongo
docker compose restart api
docker compose pull && docker compose up -d --build
```

Updates later:

```bash
cd /opt/building-management
git pull
docker compose --env-file .env up -d --build
```

## 4. TLS for App Store / Play Store

Apple requires HTTPS. Play also expects a public HTTPS API for production.

**If nginx (or another proxy) already uses 80/443** — copy and edit `deploy/nginx-building-management.conf.example`, point a domain at `64.176.81.197`, issue a certificate (Certbot), then set:

```
API_URL=https://api.yourdomain.com
```

Rebuild/restart the API so upload URLs use HTTPS:

```bash
docker compose --env-file .env up -d
```

**If 80/443 are free** and you want Caddy to manage certificates:

```bash
# in .env add: DOMAIN=api.yourdomain.com
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
docker compose --env-file .env -f docker-compose.yml -f docker-compose.https.yml up -d
```

Then point store builds at `https://api.yourdomain.com/api/v1`.

## 5. Store builds (EAS)

After the API is reachable:

1. In `mobile/`, run `npx eas init` and put the real Expo `projectId` in `app.json`.
2. Set production API URL in `mobile/eas.json` (`production.env.EXPO_PUBLIC_API_URL`) to `https://api.yourdomain.com/api/v1` (or the IP URL for Android internal testing only).
3. Android: `eas build --platform android --profile production`
4. iOS: `eas build --platform ios --profile production` (needs Apple Developer account + HTTPS API)
5. Add FCM (`google-services.json`) and APNs for production push.

Expo Go cannot be submitted to the stores. Ship a release build from EAS.

## Isolation from other projects

| Resource | Name |
|----------|------|
| Compose project | `building-management` |
| Containers | `bm-api`, `bm-mongo` |
| Network | `building-management_internal` |
| Volumes | `building-management_mongo_data`, `building-management_uploads` |
| Host port | `3011` only |

Other Docker apps on the same VPS are untouched as long as they do not also bind `3011`.
