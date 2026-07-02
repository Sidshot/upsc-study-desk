// UPSC Pro Service Worker - v3.0
// Advanced caching with offline fallback

const CACHE_NAME = 'upsc-pro-v3.1';
const OFFLINE_URL = '/offline.html';

// Core files to cache immediately
'./',
    'index.html',
    'offline.html',
    'guide.html',
    'manifest.json',
    'css/styles.css',
    'css/vendor/plyr.css',
    'js/utils.js',
    'js/db.js',
    'js/invariants.js',
    'js/state.js',
    'js/file-system.js',
    'js/app.js',
    'js/vendor/plyr.js',
    'js/vendor/pdf.min.js',
    'js/components/sidebar.js',
    'js/components/breadcrumb.js',
    'js/components/modal.js',
    'js/components/drop-zone.js',
    'js/components/provider-list.js',
    'js/components/course-list.js',
    'js/components/lecture-list.js',
    'js/components/study-mode.js',
    'js/components/export.js',
    'js/keyboard-shortcuts.js',
    'js/pwa-install.js',
    'js/analytics.js',
    'js/components/analytics-dashboard.js',
    'assets/logo.png',
    'assets/icons/icon-512.png',
    'assets/phosphor/duotone/style.css',
    'assets/phosphor/src/bold/style.css',
    'assets/phosphor/src/duotone/style.css',
    'assets/phosphor/src/fill/style.css',
    'assets/phosphor/src/light/style.css',
    'assets/phosphor/src/regular/style.css',
    'assets/phosphor/src/thin/style.css'
];

// Install - Precache core files
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Precaching core files');
                return cache.addAll(PRECACHE_URLS);
            })
            .then(() => {
                console.log('[SW] Install complete');
                return self.skipWaiting();
            })
            .catch((err) => {
                console.error('[SW] Precache failed:', err);
            })
    );
});

// Activate - Clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Claiming clients');
                return self.clients.claim();
            })
    );
});

// Fetch - Network first, fallback to cache, then offline page
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip cross-origin requests (fonts, CDN, etc.)
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        // Try network first
        fetch(event.request)
            .then((response) => {
                // Clone and cache successful responses
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(async () => {
                // Network failed, try cache
                const cachedResponse = await caches.match(event.request);
                if (cachedResponse) {
                    return cachedResponse;
                }

                // No cache, show offline page for navigation requests
                if (event.request.mode === 'navigate') {
                    return caches.match(OFFLINE_URL);
                }

                // Return empty response for other resources
                return new Response('', { status: 503, statusText: 'Offline' });
            })
    );
});

// Listen for skip waiting message
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
