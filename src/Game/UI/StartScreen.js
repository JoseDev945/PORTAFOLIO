import { Game } from '../Game.js'
import { TickOrder } from '../Ticker.js'

// Disc radius (m) shown while waiting for the click, and how long it takes to open
const DISC_RADIUS = 10.5
const OPEN_RADIUS = 320
const OPEN_DURATION = 2

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

// Start screen in the style of Bruno Simon's folio: a dark ground with ×
// marks and a glowing disc around the boat (the scene is only visible inside
// it, see Rendering.introNode). Phases:
//   loading   plain dark overlay with a pulsing ring until the game is ready
//   ready     the disc grows around the boat and "Clic para zarpar" appears
//   opening   on click the disc widens to the whole world and the camera zooms out
//   done      the effect is removed from the pipeline
export class StartScreen {
    constructor() {
        this.game = Game.getInstance()
        this.element = document.getElementById('start')
        this.button = document.getElementById('start-button')
        this.soundButton = document.getElementById('start-sound')
        this.phase = 'loading'
        this.radius = 0
        this.frames = 0
        this.openProgress = 0
        // Without post-processing (?post=off) there is no disc: a plain fade instead
        this.disc = this.game.rendering.effects.enabled
        document.documentElement.classList.add('intro')
        this.element.classList.toggle('plain', !this.disc)

        this.soundButton.addEventListener('click', (event) => {
            event.stopPropagation()
            const muted = this.muted
            this.game.settings.set('music', muted)
            this.game.settings.set('effects', muted)
            this.renderSound()
        })
        this.renderSound()
        this.game.ticker.on(() => this.update(), TickOrder.UI)
    }

    get muted() {
        return !this.game.settings.get('music') && !this.game.settings.get('effects')
    }

    renderSound() {
        this.soundButton.classList.toggle('muted', this.muted)
        this.soundButton.setAttribute('aria-label', this.muted ? 'Activar sonido' : 'Silenciar')
    }

    // Everything is loaded (called from main.js)
    ready() {
        this.phase = 'ready'
        this.button.disabled = false
        this.button.addEventListener('click', () => this.start())
        window.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'Space') this.start()
        })
    }

    start() {
        if (this.phase !== 'ready' || this.frames < 3) return
        this.phase = 'opening'
        this.element.classList.add('opening')
        document.documentElement.classList.remove('intro')
        this.game.start()
        this.game.view.endIntro()
    }

    update() {
        if (this.phase === 'loading' || this.phase === 'done') return
        const delta = this.game.ticker.delta
        const intro = this.game.rendering.intro

        if (this.phase === 'ready') {
            // Wait for a couple of real frames (the first ones compile shaders and
            // freeze) before lifting the overlay, so the disc grows smoothly
            this.frames++
            if (this.frames === 3) this.element.classList.add('revealed')
            if (this.frames >= 3) this.radius += (DISC_RADIUS - this.radius) * (1 - Math.exp(-delta * 2.2))
            intro.glow.value = 1
        } else if (this.phase === 'opening') {
            this.openProgress = Math.min(1, this.openProgress + delta / OPEN_DURATION)
            const eased = easeInOutCubic(this.openProgress)
            this.radius = DISC_RADIUS + (OPEN_RADIUS - DISC_RADIUS) * eased
            intro.glow.value = 1 - eased
            if (this.openProgress >= 1) {
                this.phase = 'done'
                this.element.classList.add('done')
                this.game.rendering.endIntro()
            }
        }
        intro.radius.value = this.disc ? this.radius : OPEN_RADIUS
    }
}
