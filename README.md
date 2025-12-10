# Tachiyomi SaaS Platform

A modern, SaaS-ready manga reading platform forked from Suwayomi/Tachidesk. This project adds Authentication, Role-Based Access Control (RBAC), and a Unified Proxy architecture to turn the single-user desktop app into a multi-user web platform.

## Architecture

The platform consists of three main services managed via Docker Compose:

1.  **Suwayomi-Gatekeeper** (Node.js/Express):
    *   **Unified Entrypoint (Port 8080)**: All traffic goes through here.
    *   **Authentication**: Integated with Supabase Auth.
    *   **RBAC**: Blocks Admin APIs (Settings, Extensions) for non-admin users.
    *   **Security**: Upgrades Admin requests to Internal Basic Auth for the backend.
    *   **Extension Manager**: Auto-installs required extensions (Weeb Central, Webtoons) on startup.

2.  **Suwayomi-WebUI** (React/Vite):
    *   Forked frontend with Login/Signup screens.
    *   Protected Routes via `AuthGuard`.
    *   Communicates with Gatekeeper (not directly with Server).

3.  **Suwayomi-Server** (Kotlin/Java):
    *   Forked backend (Tachidesk).
    *   Configured for headless operation.
    *   Secured via Basic Auth (only accessible by Gatekeeper).

## Local Development

### Prerequisites
*   Docker & Docker Compose
*   Node.js 18+ (for local helper scripts)
*   Supabase Project (URL & Anon Key)

### Setup

1.  **Clone the Repository** (Recursive):
    ```bash
    git clone --recursive https://github.com/penguarjol/Tachiyomi-SaaS.git
    cd Tachiyomi-SaaS
    ```

2.  **Configure Environment**:
    Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
    **Edit `.env`** and fill in your Supabase credentials. These variables are passed to the containers.

3.  **Build and Run**:
    ```bash
    docker-compose up -d --build
    ```

    *   **Wait ~30-60s** for the Server to start and Gatekeeper to install extensions.
    *   Access the app at: **`http://localhost:8080`**

### Repository Structure

*   `Suwayomi-Gatekeeper/`: Source code for the proxy service.
*   `Suwayomi-WebUI/`: Submodule pointing to the frontend fork.
*   `Suwayomi-Server/`: Submodule pointing to the backend fork.
*   `Suwayomi-Mobile/`: Capacitor wrapper for mobile app generation.

## Features

*   **Secure Auth**: Users must log in via Supabase.
*   **Smart Routing**: `/api/*` requests go to Server, page requests go to WebUI.
*   **Admin Protection**: Critical endpoints (`/api/v1/settings/*`, `/api/v1/extension/*`) return `403 Forbidden` for standard users.
*   **Extension Persistence**: Defined in `extensions.json`, auto-restored on reboot.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for instructions on deploying to Fly.io.
