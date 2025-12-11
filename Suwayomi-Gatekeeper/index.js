const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;
const TARGET_URL = process.env.SUWAYOMI_URL || 'http://localhost:4567';

app.use(cors());

// --- SUPABASE SETUP ---
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[Auth] Supabase Client Initialized.');
} else {
    console.warn('[Auth] WARNING: SUPABASE_URL or SUPABASE_ANON_KEY not set. Auth will fail.');
}

// --- MIDDLEWARE: AUTHENTICATION ---
// Verifies 'X-User-ID' (legacy) OR Authorization Bearer token (Supabase)
const authMiddleware = async (req, res, next) => {
    // 1. Check for Bearer Token (Supabase)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (supabase) {
            const { data: { user }, error } = await supabase.auth.getUser(token);

            if (!error && user) {
                // Fetch profile for Role/Tokens
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                req.user = {
                    id: user.id,
                    role: profile?.role || 'free',
                    tokens: profile?.tokens || 0,
                    isPremium: profile?.is_premium || false
                };
                console.log(`[Auth] Authenticated User: ${user.email} (${req.user.role})`);
                return next();
            } else {
                console.log('[Auth] Invalid Token:', error?.message);
            }
        }
    }

    // 2. Fallback / Anonymous
    console.log('[Auth] Anonymous Request');
    req.user = null;
    next();
};

// --- MIDDLEWARE: BILLING / PAYWALL ---
const billingMiddleware = async (req, res, next) => {
    // Regex to match chapter page requests: /api/v1/manga/{mangaId}/chapter/{chapterId}/page/{page}
    if (req.path.includes('/chapter/') && req.path.includes('/page/')) {
        console.log(`[Billing] Intercepting request: ${req.path}`);

        if (!req.user) {
            return res.status(401).json({ error: 'Login required to view chapters' });
        }

        if (req.user.isPremium || req.user.role === 'admin') {
            console.log(`[Billing] User ${req.user.id} is Premium/Admin. Access Granted.`);
            return next();
        }

        if (req.user.tokens > 0) {
            console.log(`[Billing] User ${req.user.id} used 1 token. Remaining: ${req.user.tokens - 1}`);

            // Decrement tokens in DB
            if (supabase) {
                const { error } = await supabase.rpc('decrement_token', { user_id: req.user.id }); // Assuming RPC or just update
                // Simple update for now if RPC doesn't exist (RPC is cleaner for concurrency)
                if (error) {
                    // Fallback to direct update
                    await supabase
                        .from('profiles')
                        .update({ tokens: req.user.tokens - 1 })
                        .eq('id', req.user.id);
                }
            }

            return next();
        }

        return res.status(402).json({ error: 'Payment Required: Insufficient Tokens' });
    }

    next();
};

// --- MIDDLEWARE: ADMIN PROTECTION ---
const adminMiddleware = (req, res, next) => {
    // List of restricted paths patterns
    const restrictedPaths = [
        '/api/v1/extension/install',
        '/api/v1/extension/uninstall',
        '/api/v1/extension/update',
        '/api/v1/settings',
        '/api/v1/download'
    ];

    const isRestricted = restrictedPaths.some(path => req.path.startsWith(path));

    if (isRestricted) {
        if (!req.user || req.user.role !== 'admin') {
            console.log(`[Admin] Blocked unauthorized access to ${req.path} by ${req.user ? req.user.email : 'Anonymous'}`);
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
        console.log(`[Admin] Access granted to ${req.path} for ${req.user.email}`);
    }

    next();
};

app.use(authMiddleware);
app.use(billingMiddleware);
app.use(adminMiddleware);

// --- PROXY SETUP ---
const WEBUI_URL = process.env.WEBUI_URL || 'http://suwayomi-webui:3000';
const SERVER_AUTH = 'Basic ' + Buffer.from('suwayomi:suwayomi').toString('base64');

// 1. Forward API requests to Suwayomi Server (Backend)
app.use('/api', (req, res, next) => {
    console.log(`[Proxy] API Request: ${req.method} ${req.url}`);
    // Force Header Injection here (more reliable than onProxyReq)
    req.headers['authorization'] = SERVER_AUTH;
    next();
}, createProxyMiddleware({
    // app.use('/api') strips '/api', so we must add it back to the target
    target: TARGET_URL + '/api',
    changeOrigin: true,
    logLevel: 'debug',
    onProxyReq: (proxyReq, req, res) => {
        // Redundant safely check or logging
        console.log(`[Proxy] Forwarding to: ${TARGET_URL}${req.originalUrl}`);
    },
    onError: (err, req, res) => {
        console.error('[Proxy] Error:', err);
    }
}));

// 2. Forward everything else to Suwayomi WebUI (Frontend)
app.use('/', createProxyMiddleware({
    target: WEBUI_URL,
    changeOrigin: true,
    ws: true, // Enable WebSocket support for HMR (if dev) and potential app sockets
    logLevel: 'debug',
    onProxyReq: (proxyReq, req, res) => {
        // Optionally redact headers or add internal flags
    }
}));

app.listen(PORT, async () => {
    console.log(`Gatekeeper running on port ${PORT}`);
    console.log(`Proxying to: ${TARGET_URL}`);

    // Auto-install extensions logic
    // Node 18 has native fetch, so we don't need node-fetch import
    // const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

    const installExtensions = async () => {
        console.log('[Extension Installer] Waiting for Suwayomi Server to be ready...');
        let requiredExtensions = [];
        try {
            requiredExtensions = require('./extensions.json');
            console.log(`[Extension Installer] Loaded ${requiredExtensions.length} extensions from configuration.`);
        } catch (err) {
            console.error('[Extension Installer] Failed to load extensions.json:', err.message);
            return;
        }

        // Simple retry loop to wait for server (300 retries * 2s = 600s / 10 mins)
        for (let i = 0; i < 300; i++) {
            try {
                const healthPath = `${TARGET_URL}/api/v1/settings/about`; // Correct endpoint checks server availability
                const healthRes = await fetch(healthPath, {
                    headers: { 'Authorization': SERVER_AUTH }
                });
                if (healthRes.ok) {
                    console.log('[Extension Installer] Server is ready. Waiting 15s for repositories to sync...');
                    await new Promise(resolve => setTimeout(resolve, 15000));
                    console.log('[Extension Installer] Installing extensions...');

                    for (const pkg of requiredExtensions) {
                        let installed = false;
                        for (let attempt = 1; attempt <= 12; attempt++) { // Retry for 60 seconds (12 * 5s)
                            try {
                                console.log(`[Extension Installer] Installing ${pkg} (Attempt ${attempt}/12)...`);
                                const installRes = await fetch(`${TARGET_URL}/api/v1/extension/install/${pkg}`, {
                                    headers: { 'Authorization': SERVER_AUTH }
                                });

                                if (installRes.ok) {
                                    console.log(`[Extension Installer] ${pkg} installed successfully.`);
                                    installed = true;
                                    break;
                                } else if (installRes.status === 404) {
                                    console.warn(`[Extension Installer] ${pkg} not found (404). Repository might not be synced yet. Retrying in 5s...`);
                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                } else {
                                    throw new Error(`Status ${installRes.status} ${installRes.statusText}`);
                                }
                            } catch (err) {
                                console.error(`[Extension Installer] Error installing ${pkg}:`, err.message);
                                break; // Non-404 error, skip to next pkg
                            }
                        }
                        if (!installed) {
                            console.error(`[Extension Installer] Failed to install ${pkg} after multiple attempts.`);
                        }
                    }
                    return;
                }
            } catch (err) {
                // Ignore Connection Refused, just wait
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        console.error('[Extension Installer] Server timed out. Skipping extension installation.');
    };

    installExtensions();
});

