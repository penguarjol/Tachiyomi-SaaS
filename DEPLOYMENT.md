# Fly.io Deployment Guide for Tachiyomi-SaaS

This architecture consists of 3 distinct services that should be deployed individually to Fly.io (or via Docker Compose on a VPS).

## 1. Suwayomi Server (Backend)
The core backend processing logic.

- **App Name**: `suwayomi-backend` (example)
- **Port**: 4567
- **Volume**: Requires `suwayomi_data` mounted at `/data`.

**`fly.toml`**:
```toml
app = "suwayomi-backend"
primary_region = "ewr"

[build]
  dockerfile = "Dockerfile"
  # Run from Suwayomi-Server directory

[env]
  JAVA_OPTS = "-Xmx2g -Djava.awt.headless=true"
  TS_CONFIG_server_authMode = "BASIC_AUTH"
  TS_CONFIG_server_authUsername = "suwayomi"
  TS_CONFIG_server_authPassword = "suwayomi" 
  # Important: This password is used by Gatekeeper to control Admin actions.

[[mounts]]
  source = "suwayomi_data"
  destination = "/data"

[http_service]
  internal_port = 4567
  force_https = false
  # We don't expose this publicly ideally, only within private network to Gatekeeper.
```

## 2. Suwayomi WebUI (Frontend)
The React/Vite frontend.

- **App Name**: `suwayomi-frontend`
- **Port**: 3000

**`fly.toml`**:
```toml
app = "suwayomi-frontend"
primary_region = "ewr"

[build]
  dockerfile = "Dockerfile"
  # Run from Suwayomi-WebUI directory

[env]
  VITE_SUPABASE_URL = "https://your-project.supabase.co"
  VITE_SUPABASE_ANON_KEY = "your-anon-key"

[http_service]
  internal_port = 3000
  force_https = false
```

## 3. Suwayomi Gatekeeper (Proxy & Auth)
The public entrypoint. Handles auth, billing check, and routing.

- **App Name**: `suwayomi-gatekeeper`
- **Port**: 8080

**`fly.toml`**:
```toml
app = "suwayomi-gatekeeper"
primary_region = "ewr"

[build]
  dockerfile = "Dockerfile"
  # Run from Suwayomi-Gatekeeper directory

[env]
  # Internal .flycast domains allow private networking
  SUWAYOMI_URL = "http://suwayomi-backend.flycast:4567"
  WEBUI_URL = "http://suwayomi-frontend.flycast:3000"
  
  SUPABASE_URL = "https://your-project.supabase.co"
  SUPABASE_ANON_KEY = "your-anon-key"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  min_machines_running = 1
```

## Deployment Order
1. **Server**: `fly launch` in `Suwayomi-Server`. Create volume. Deploy.
2. **WebUI**: `fly launch` in `Suwayomi-WebUI`. Deploy.
3. **Gatekeeper**: `fly launch` in `Suwayomi-Gatekeeper`. Set secrets/env. Deploy.
4. **Mobile App**: Point Capacitor config to Gatekeeper's public URL.
