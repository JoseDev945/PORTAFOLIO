import { Game } from './Game.js'
import { TickOrder } from './Ticker.js'

// Below this the resolution goes down; above, it may go back up
const FPS_LOW = 55
const FPS_HIGH = 58
// Seconds per measure
const WINDOW = 1
// Measures ignored at load or after a change (shaders compiling make frames slow)
const SETTLE = 2
// Good measures in a row needed before going back up (avoids see-sawing)
const PATIENCE = 3
// Never more than this (× CSS pixels): beyond it nobody sees the difference
const MAX_PIXEL_RATIO = 2

// Keeps the frame rate at 60 or more on any device without touching the look:
// the graphics are always the same, only the render resolution adapts. The
// "Resolución" slider (1–100 % of the screen's real resolution) is the most it
// may use; whenever the frame rate drops below 55 it goes down from there, at
// once if the drop is big, and climbs back slowly when there's room.
// ?fps shows the counter. Triggers 'quality:change' when the resolution changes.
export class Quality {
    constructor() {
        this.game = Game.getInstance()
        const params = new URLSearchParams(window.location.search)
        this.isMobile = window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600

        // Fixed look, sized per device (these can't change without rebuilding passes)
        this.preset = {
            shadowMapSize: this.isMobile ? 1024 : 2048,
            // Fraction of the screen (CSS pixels) the water reflection is rendered at
            reflections: this.isMobile ? 0.25 : 0.4
        }
        // MSAA multiplies the cost of every pass (the scene renders to several
        // targets): only on plain screens, where jagged edges show the most
        this.antialias = !this.isMobile && window.devicePixelRatio <= 1
        this.minPixelRatio = 0.5

        this.measure = { frames: 0, elapsed: 0, settle: SETTLE, good: 0 }
        this.fps = 60
        this.applyResolution()
        this.game.events.on('settings:change', (key) => key === 'resolution' && this.applyResolution())

        // FPS counter: "Mostrar FPS" in the pause menu, or always with ?fps / #debug
        this.counter = document.createElement('div')
        this.counter.className = 'fps'
        document.body.appendChild(this.counter)
        this.counterForced = params.has('fps') || window.location.hash === '#debug'
        this.display = { frames: 0, elapsed: 0 }
        this.showCounter()
        this.game.events.on('settings:change', (key) => key === 'showFps' && this.showCounter())

        this.game.ticker.on(() => this.update(this.game.ticker.realDelta), TickOrder.QUALITY)
    }

    get shadowMapSize() {
        return this.preset.shadowMapSize
    }

    // The slider: a fraction (0.01 to 1) of the screen's real resolution
    applyResolution() {
        const scale = Number(this.game.settings.get('resolution'))
        const fraction = Number.isFinite(scale) ? Math.min(Math.max(scale, 0.01), 1) : 1
        this.maxPixelRatio = Math.min(Math.max(window.devicePixelRatio * fraction, 0.1), MAX_PIXEL_RATIO)
        this.pixelRatio = this.maxPixelRatio
        this.measure.settle = SETTLE
        this.measure.good = 0
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

    update(delta) {
        this.updateCounter(delta)
        const measure = this.measure
        measure.frames++
        measure.elapsed += delta
        if (measure.elapsed < WINDOW) return
        this.fps = measure.frames / measure.elapsed
        measure.frames = 0
        measure.elapsed = 0

        // A hidden tab or the first frames say nothing about the device
        if (document.hidden) return
        if (measure.settle > 0) {
            measure.settle--
            return
        }

        const floor = Math.min(this.minPixelRatio, this.maxPixelRatio)
        if (this.fps < FPS_LOW) {
            // The cost grows with the pixel count (ratio²): a big drop gets a big cut at once
            measure.good = 0
            this.setPixelRatio(Math.max(floor, this.pixelRatio * Math.min(0.9, Math.max(0.5, Math.sqrt(this.fps / 60)))))
        } else if (this.fps > FPS_HIGH && this.pixelRatio < this.maxPixelRatio && ++measure.good >= PATIENCE) {
            measure.good = 0
            this.setPixelRatio(Math.min(this.maxPixelRatio, this.pixelRatio + 0.1))
        }
    }

    setPixelRatio(pixelRatio) {
        if (Math.abs(pixelRatio - this.pixelRatio) < 0.01) return
        this.pixelRatio = pixelRatio
        // Give the new size a moment before judging it
        this.measure.settle = 1
        this.game.events.trigger('quality:change')
    }
}
