import { Game } from './Game.js'
import { TickOrder } from './Ticker.js'

// Quality tiers. Each one says what the expensive systems may do:
//   pixelRatio    highest render resolution (× CSS pixels, capped by the screen)
//   shadows       sun shadows (a second render of the scene) and their map size
//   reflections   water reflections (a third render) resolution, 0 = off
//   bloom         glow of emissive things (several blur passes)
//   tiltShift     miniature blur in the overview (the most expensive effect)
export const TIERS = {
    low: { name: 'Baja', pixelRatio: 1, shadows: false, shadowMapSize: 512, reflections: 0, bloom: false, tiltShift: false },
    medium: { name: 'Media', pixelRatio: 1.25, shadows: true, shadowMapSize: 1024, reflections: 0.25, bloom: true, tiltShift: false },
    high: { name: 'Alta', pixelRatio: 1.5, shadows: true, shadowMapSize: 2048, reflections: 0.4, bloom: true, tiltShift: true }
}
const ORDER = ['low', 'medium', 'high']

// Below this the frame rate is too low: first a lower tier, then less resolution
const FPS_LOW = 50
// Above this there's room to spare: more resolution, then a higher tier
const FPS_HIGH = 58
// Seconds per measure
const WINDOW = 1.5
// Measures ignored after a change (shaders compiling make the first frames slow)
const SETTLE = 2
// Good measures in a row needed before trying a higher tier
const PATIENCE = 3

// Keeps 60 FPS on any device. The tier starts from the device (phones at
// "medium", computers at "high") and moves on its own when the setting
// "Calidad" is on Automática: if the frame rate drops it goes down a tier
// (fewer passes), and only then lowers the resolution. When there's room it
// goes back up, but never to a tier that already proved too slow.
// ?quality=low|medium|high pins a tier (for testing); ?fps shows the counter.
// Events: 'quality:change' (resolution) and 'quality:tier' (tier preset).
export class Quality {
    constructor() {
        this.game = Game.getInstance()
        const params = new URLSearchParams(window.location.search)
        this.isMobile = window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600
        this.ceiling = this.isMobile ? 'medium' : 'high'
        const forced = params.get('quality')
        this.forced = ORDER.includes(forced) ? forced : null

        // MSAA can't change after the renderer exists: only computers with a plain screen
        this.antialias = !this.isMobile && window.devicePixelRatio <= 1.5
        this.minPixelRatio = 0.6

        this.measure = { frames: 0, elapsed: 0, settle: SETTLE, good: 0 }
        this.fps = 60
        this.applySetting()

        this.game.events.on('settings:change', (key) => {
            if (key === 'quality') this.applySetting()
            if (key === 'resolution') this.applyResolution()
        })

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

    get preset() {
        return TIERS[this.tier]
    }

    get shadowMapSize() {
        return this.preset.shadowMapSize
    }

    // "Calidad" in the pause menu: 'auto' or a fixed tier
    applySetting() {
        const setting = this.game.settings.get('quality')
        this.auto = !this.forced && !ORDER.includes(setting)
        // The highest tier automatic mode may try (lowered when one is too slow)
        this.cap = this.ceiling
        this.setTier(this.forced ?? (this.auto ? this.ceiling : setting))
    }

    setTier(tier) {
        if (tier === this.tier) return
        this.tier = tier
        this.measure.settle = SETTLE
        this.measure.good = 0
        this.applyResolution()
        this.game.events.trigger('quality:tier', this.preset)
    }

    get maxPixelRatio() {
        return Math.min(window.devicePixelRatio, this.preset.pixelRatio)
    }

    // "Resolución" in the pause menu: 'auto' adapts to the frame rate,
    // a number is a fixed percentage of the screen's real resolution
    applyResolution() {
        const setting = this.game.settings.get('resolution')
        const scale = Number(setting)
        if (setting === 'auto' || !Number.isFinite(scale) || scale <= 0) {
            this.adaptiveResolution = !this.forced
            this.pixelRatio = this.maxPixelRatio
        } else {
            this.adaptiveResolution = false
            this.pixelRatio = Math.min(Math.max(window.devicePixelRatio * scale, 0.25), 2)
        }
        this.game.events.trigger('quality:change')
    }

    showCounter() {
        this.counter.hidden = !(this.counterForced || this.game.settings.get('showFps'))
    }

    // Refreshed twice per second: fps, time per frame, render resolution and tier,
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
        this.counter.textContent = `${Math.round(fps)} FPS · ${ms.toFixed(1)} ms · ${Math.round((this.pixelRatio / window.devicePixelRatio) * 100)}% · ${this.preset.name}`
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

        // A hidden tab or the first frames after a change say nothing about the device
        if (document.hidden) return
        if (measure.settle > 0) {
            measure.settle--
            return
        }

        if (this.fps < FPS_LOW) {
            measure.good = 0
            const index = ORDER.indexOf(this.tier)
            if (this.auto && index > 0) {
                // This tier is too much for the device: don't come back to it
                this.cap = ORDER[index - 1]
                this.setTier(this.cap)
            } else if (this.adaptiveResolution && this.pixelRatio > this.minPixelRatio) {
                this.setPixelRatio(Math.max(this.minPixelRatio, this.pixelRatio * 0.85))
            }
            return
        }

        if (this.fps > FPS_HIGH) {
            if (this.adaptiveResolution && this.pixelRatio < this.maxPixelRatio) {
                this.setPixelRatio(Math.min(this.maxPixelRatio, this.pixelRatio + 0.1))
                return
            }
            measure.good++
            const index = ORDER.indexOf(this.tier)
            if (this.auto && measure.good >= PATIENCE && index < ORDER.indexOf(this.cap)) this.setTier(ORDER[index + 1])
        }
    }

    setPixelRatio(pixelRatio) {
        if (Math.abs(pixelRatio - this.pixelRatio) < 0.01) return
        this.pixelRatio = pixelRatio
        this.game.events.trigger('quality:change')
    }
}
