import { Game } from '../Game.js'
import { CAMERA_NAMES, CAMERA_NAMES_TOUCH } from '../View.js'
import { isTouch } from '../Inputs.js'

// Shows the name of the camera mode for a moment after switching, and other
// short notices (e.g. "Modo rendimiento activado" at the start)
export class CameraToast {
    constructor() {
        this.game = Game.getInstance()
        this.element = document.getElementById('camera-toast')
        this.game.events.on('camera:change', (mode) => this.show((isTouch() ? CAMERA_NAMES_TOUCH : CAMERA_NAMES)[mode]))
        // After the start screen has opened (and the camera's own toast)
        this.game.events.on('start', () => {
            if (!this.game.quality.performance) return
            setTimeout(() => this.show('Modo rendimiento activado · puedes cambiarlo en Pausa', { icon: '⚡', duration: 4000 }), 2300)
        })
    }

    show(text, { icon = '🎥', duration = 1400 } = {}) {
        this.element.textContent = `${icon} ${text}`
        this.element.classList.add('visible')
        clearTimeout(this.timeout)
        this.timeout = setTimeout(() => this.element.classList.remove('visible'), duration)
    }
}
