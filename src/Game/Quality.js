import { Game } from './Game.js'
import { TickOrder } from './Ticker.js'

// Never more than this (× CSS pixels): beyond it nobody sees the difference
const MAX_PIXEL_RATIO = 2

// Graphics settings. The render resolution never changes on its own: it is
// exactly what the "Resolución" slider says (1–100 % of the screen's real
// resolution). To gain FPS without losing sharpness there's "Modo rendimiento",
// which drops the costly extra renders instead of pixels:
//   shadows       sun shadows (a second render of the scene)
//   reflections   water reflections (a third render)
//   tiltShift     miniature blur in the overview
// It's on by default on phones. Switching it reloads the page: rebuilding
// shadows and passes on the fly left the screen light blue on some GPUs.
// ?fps shows the counter. Triggers 'quality:change' when the resolution changes.
export class Quality {
    constructor() {
        this.game = Game.getInstance()
        const { settings } = this.game
        const params = new URLSearchParams(window.location.search)
        this.isMobile = window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600

        if (typeof settings.get('performance') !== 'boolean') settings.set('performance', this.isMobile)
        this.performance = settings.get('performance')
        this.preset = {
            shadows: !this.performance,
            shadowMapSize: this.isMobile ? 1024 : 2048,
            reflections: !this.performance,
            // Fraction of the screen (CSS pixels) the water reflection is rendered at
            reflectionResolution: this.isMobile ? 0.25 : 0.4,
            tiltShift: !this.performance
        }
        // MSAA multiplies the cost of every pass (the scene renders to several
        // targets): only on plain screens, where jagged edges show the most
        this.antialias = !this.isMobile && window.devicePixelRatio <= 1

        this.applyResolution()
        this.game.events.on('settings:change', (key) => {
            if (key === 'resolution') this.applyResolution()
            if (key === 'performance') window.location.reload()
        })

        // FPS counter: "Mostrar FPS" in the pause menu, or always with ?fps / #debug
        this.counter = document.createElement('div')
        this.counter.className = 'fps'
        document.body.appendChild(this.counter)
        this.counterForced = params.has('fps') || window.location.hash === '#debug'
        this.display = { frames: 0, elapsed: 0 }
        this.showCounter()
        this.game.events.on('settings:change', (key) => key === 'showFps' && this.showCounter())

        this.game.ticker.on(() => this.updateCounter(this.game.ticker.realDelta), TickOrder.QUALITY)
    }

    get shadowMapSize() {
        return this.preset.shadowMapSize
    }

    // The slider: a fraction (0.01 to 1) of the screen's real resolution
    applyResolution() {
        const scale = Number(this.game.settings.get('resolution'))
        const fraction = Number.isFinite(scale) ? Math.min(Math.max(scale, 0.01), 1) : 1
        this.pixelRatio = Math.min(Math.max(window.devicePixelRatio * fraction, 0.1), MAX_PIXEL_RATIO)
        this.game.events.trigger('quality:change')
    }

    showCounter() {
        this.counter.hidden = !(this.counterForced || this.game.settings.get('showFps'))
    }

    // Refreshed twice per second: fps, time per frame and render resolution,
    // green / yellow / red depending on how smooth it is
    updateCounter(delta) {
        if (this.counter.hidden) return
        this.display.frames++
        this.display.elapsed += delta
        if (this.display.elapsed < 0.5) return
        const fps = this.display.frames / this.display.elapsed
        const ms = (this.display.elapsed / this.display.frames) * 1000
        this.display.frames = 0
        this.display.elapsed = 0
        this.counter.textContent = `${Math.round(fps)} FPS · ${ms.toFixed(1)} ms · ${Math.round((this.pixelRatio / window.devicePixelRatio) * 100)}%`
        this.counter.dataset.level = fps >= 55 ? 'good' : fps >= 30 ? 'ok' : 'bad'
    }
}
