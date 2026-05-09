import notifySound from '../assets/notification.mp3';

class AudioController {
    constructor() {
        this.audio = new Audio(notifySound);
        this.audio.volume = 0.6;
    }

    init() {
        // No-op for compatibility
    }

    /**
     * Plays the custom system notification sound.
     */
    playNotification() {
        this.audio.currentTime = 0;
        this.audio.play().catch(e => console.warn('[AudioController] Autoplay blocked', e));
    }

    setVolume(vol) {
        this.audio.volume = Math.max(0, Math.min(1, vol));
    }
}

// Export a singleton instance
export const systemAudio = new AudioController();
