import { Game } from '../Game.js'
import { CAMERA_NAMES } from '../View.js'

// Shows the name of the camera mode for a moment after switching
export class CameraToast {
    constructor() {
        this.game = Game.getInstance()
        this.element = document.getElementById('camera-toast')
        this.game.events.on('camera:change', (mode) => this.show(CAMERA_NAMES[mode]))
    }

    show(text) {
        this.element.textContent = `🎥 ${text}`
        this.element.classList.add('visible')
        clearTimeout(this.timeout)
        this.timeout = setTimeout(() => this.element.classList.remove('visible'), 1400)
    }
}
