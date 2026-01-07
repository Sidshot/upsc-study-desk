/**
 * UPSC Pro - PWA Install Handler
 * Provides custom install button and prompt
 */

const PWAInstall = {
    deferredPrompt: null,
    isInstalled: false,

    init() {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            this.isInstalled = true;
            console.log('[PWA] Running as installed app');
            return;
        }

        // Listen for install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            console.log('[PWA] Install prompt captured');
            this.showInstallButton();
        });

        // Track successful install
        window.addEventListener('appinstalled', () => {
            console.log('[PWA] App installed successfully');
            this.isInstalled = true;
            this.hideInstallButton();
            this.showInstallSuccess();
        });

        // Add install button to DOM
        this.createInstallButton();
    },

    createInstallButton() {
        const btn = document.createElement('button');
        btn.id = 'pwa-install-btn';
        btn.className = 'pwa-install-btn hidden';
        btn.innerHTML = `
            <i class="ph ph-download-simple"></i>
            <span>Install App</span>
        `;
        btn.onclick = () => this.promptInstall();

        // Add to toolbar actions
        const toolbar = document.querySelector('.toolbar-actions');
        if (toolbar) {
            toolbar.insertBefore(btn, toolbar.firstChild);
        } else {
            document.body.appendChild(btn);
        }
    },

    showInstallButton() {
        const btn = document.getElementById('pwa-install-btn');
        if (btn) {
            btn.classList.remove('hidden');
            btn.classList.add('pwa-install-animate');
        }
    },

    hideInstallButton() {
        const btn = document.getElementById('pwa-install-btn');
        if (btn) {
            btn.classList.add('hidden');
        }
    },

    async promptInstall() {
        if (!this.deferredPrompt) {
            console.log('[PWA] No install prompt available');
            return;
        }

        // Show the prompt
        this.deferredPrompt.prompt();

        // Wait for user response
        const { outcome } = await this.deferredPrompt.userChoice;
        console.log('[PWA] Install outcome:', outcome);

        // Clear the prompt
        this.deferredPrompt = null;
        this.hideInstallButton();
    },

    showInstallSuccess() {
        // Create success toast
        const toast = document.createElement('div');
        toast.className = 'pwa-toast';
        toast.innerHTML = `
            <div class="pwa-toast-icon">🎉</div>
            <div class="pwa-toast-content">
                <div class="pwa-toast-title">UPSC Pro Installed!</div>
                <div class="pwa-toast-text">Find it in your Start menu or desktop</div>
            </div>
        `;
        document.body.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add('show'), 100);

        // Remove after delay
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }
};

// Initialize when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PWAInstall.init());
} else {
    PWAInstall.init();
}

// Export for manual use
window.PWAInstall = PWAInstall;
