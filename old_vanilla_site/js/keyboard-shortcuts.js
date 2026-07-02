/**
 * UPSC Pro - Keyboard Shortcuts Handler
 * Global keyboard shortcuts for enhanced video/study experience
 */

const KeyboardShortcuts = {
    initialized: false,

    init() {
        if (this.initialized) return;
        this.initialized = true;

        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        console.log('[Shortcuts] Keyboard shortcuts enabled');
    },

    handleKeydown(e) {
        // Ignore if typing in input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Only active in study mode
        if (AppState.mode !== 'study') {
            return;
        }

        // Get player OR native video element
        const player = StudyMode.player;
        const video = document.querySelector('.plyr video, .study-video, video');

        if (!player && !video) {
            return;
        }

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                if (player) {
                    player.togglePlay();
                    this.showToast(player.playing ? 'Playing' : 'Paused');
                } else if (video) {
                    if (video.paused) {
                        video.play();
                        this.showToast('Playing');
                    } else {
                        video.pause();
                        this.showToast('Paused');
                    }
                }
                break;

            case 'ArrowLeft':
                e.preventDefault();
                if (player) {
                    player.rewind(10);
                } else if (video) {
                    video.currentTime = Math.max(0, video.currentTime - 10);
                }
                this.showToast('-10s');
                break;

            case 'ArrowRight':
                e.preventDefault();
                if (player) {
                    player.forward(10);
                } else if (video) {
                    video.currentTime = Math.min(video.duration, video.currentTime + 10);
                }
                this.showToast('+10s');
                break;

            case 'ArrowUp':
                e.preventDefault();
                if (player) {
                    player.increaseVolume(0.1);
                    this.showToast(`Volume ${Math.round(player.volume * 100)}%`);
                } else if (video) {
                    video.volume = Math.min(1, video.volume + 0.1);
                    this.showToast(`Volume ${Math.round(video.volume * 100)}%`);
                }
                break;

            case 'ArrowDown':
                e.preventDefault();
                if (player) {
                    player.decreaseVolume(0.1);
                    this.showToast(`Volume ${Math.round(player.volume * 100)}%`);
                } else if (video) {
                    video.volume = Math.max(0, video.volume - 0.1);
                    this.showToast(`Volume ${Math.round(video.volume * 100)}%`);
                }
                break;

            case 'KeyM':
                e.preventDefault();
                if (player) {
                    player.muted = !player.muted;
                    this.showToast(player.muted ? 'Muted' : 'Unmuted');
                } else if (video) {
                    video.muted = !video.muted;
                    this.showToast(video.muted ? 'Muted' : 'Unmuted');
                }
                break;

            case 'KeyF':
                e.preventDefault();
                // Use video wrapper or video element for fullscreen
                const videoWrapper = document.querySelector('.video-wrapper') || document.querySelector('.plyr');
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                    this.showToast('Exit Fullscreen');
                } else if (videoWrapper) {
                    videoWrapper.requestFullscreen();
                    this.showToast('Fullscreen');
                } else if (video) {
                    video.requestFullscreen();
                    this.showToast('Fullscreen');
                }
                break;

            case 'KeyP':
                e.preventDefault();
                if (document.pictureInPictureEnabled) {
                    this.togglePiP();
                }
                break;

            case 'Escape':
                if (AppState.mode === 'study' && !document.fullscreenElement) {
                    e.preventDefault();
                    StudyMode.exit();
                }
                break;

            // Speed controls
            case 'BracketLeft': // [
                e.preventDefault();
                this.changeSpeed(-0.25);
                break;

            case 'BracketRight': // ]
                e.preventDefault();
                this.changeSpeed(0.25);
                break;

            case 'Digit1':
            case 'Digit2':
                if (!e.ctrlKey && !e.altKey) {
                    e.preventDefault();
                    const speed = e.code === 'Digit1' ? 1 : 2;
                    if (player) {
                        player.speed = speed;
                    } else if (video) {
                        video.playbackRate = speed;
                    }
                    this.showToast(`Speed ${speed}x`);
                }
                break;
        }
    },

    changeSpeed(delta) {
        const player = StudyMode.player;
        const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
        let currentIdx = speeds.indexOf(player.speed);
        if (currentIdx === -1) currentIdx = 2; // Default to 1x

        const newIdx = Math.max(0, Math.min(speeds.length - 1, currentIdx + (delta > 0 ? 1 : -1)));
        player.speed = speeds[newIdx];
        this.showToast(`Speed ${speeds[newIdx]}x`);
    },

    async togglePiP() {
        try {
            const video = document.querySelector('.study-video, .plyr video');
            if (!video) return;

            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                this.showToast('PiP Off');
            } else {
                await video.requestPictureInPicture();
                this.showToast('Picture-in-Picture');
            }
        } catch (err) {
            console.error('PiP error:', err);
        }
    },

    showToast(message) {
        // Remove existing toast
        const existing = document.querySelector('.shortcut-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'shortcut-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Remove after delay
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 1500);
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => KeyboardShortcuts.init());

// Expose globally
window.KeyboardShortcuts = KeyboardShortcuts;
