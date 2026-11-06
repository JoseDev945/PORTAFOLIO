import { Game } from './Game.js'
import { TickOrder } from './Ticker.js'

// Graphics modes, picked in the pause menu ("Gráficos"). They're applied when
// the game loads: switching reloads the page, because rebuilding shadows and
// render passes on the fly isn't reliable on every GPU.
//   pixelRatio    highest render resolution (× CSS pixels, capped by the screen)
//   shadows       sun shadows (a second render of the scene) and their map size
//   reflections   water reflections (a third render) resolution, 0 = off
//   bloom         glow of emissive things (several blur passes)
//   tiltShift     miniature blur in the overview (the most expensive effect)
export const MODES = {
    performance: { name: 'Rendimiento', pixelRatio: 1, shadows: false, shadowMapSize: 512, reflections: 0, bloom: true, tiltShift: false },
    medium: { name: 'Medio', pixelRatio: 1.25, shadows: true, shadowMapSize: 1024, reflections: 0.25, bloom: true, tiltShift: false },
    high: { name: 'Alta gama', pixelRatio: 1.5, shadows: true, shadowMapSize: 2048, reflections: 0.4, bloom: true, tiltShift: true }
}

// Below this the resolution goes down; above, it goes back up
const FPS_LOW = 50
const FPS_HIGH = 58
// Seconds per measure
const WINDOW = 1
// Measures ignored at load (shaders compiling make the first frames slow)
const SETTLE = 2

// Keeps the frame rate as high as possible without touching the look: the
// mode never changes on its own, only the render resolution adapts (when
// "Resolución" is Automática). Phones start in "Medio", computers in "Alta gama".
// ?quality=performance|medium|high pins a mode for this visit; ?fps shows the counter.
// Triggers 'quality:change' when the resolution changes.
export class Quality {
    constructor() {
        this.game = Game.getInstance()
        const { settings } = this.game
        const params = new URLSearchParams(window.location.search)
        const isMobile = window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600

        const forced = params.get('quality')
        if (!(settings.get('quality') in MODES)) settings.set('quality', isMobile ? 'medium' : 'high')
        this.mode = forced in MODES ? forced : settings.get('quality')
        this.preset = MODES[this.mode]
        this.forced = forced in MODES

        // MSAA is costly on top of a high pixel ratio, and can't change after the renderer exists
        this.antialias = this.mode === 'high' && window.devicePixelRatio <= 1.5
        this.maxPixelRatio = Math.min(window.devicePixelRatio, this.preset.pixelRatio)
        this.minPixelRatio = Math.min(0.6, this.maxPixelRatio)
        this.applyResolution()

        this.game.events.on('settings:change', (key) => {
            if (key === 'resolution') this.applyResolution()
            // New mode: the cleanest way to rebuild every pass is a fresh load
            if (key === 'quality') window.location.reload()
        })

        this.measure = { frames: 0, elapsed: 0, settle: SETTLE }
        this.fps = 60

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

    // "Resolución" in the pause menu: 'auto' adapts to the frame rate,
    // a number is a fixed percentage of the screen's real resolution
    applyResolution() {
        const setting = this.game.settings.get('resolution')
        const scale = Number(setting)
        if (setting === 'auto' || !Number.isFinite(scale) || scale <= 0) {
            this.adaptive = !this.forced
            this.pixelRatio = this.maxPixelRatio
        } else {
            this.adaptive = false
            this.pixelRatio = Math.min(Math.max(window.devicePixelRatio * scale, 0.25), 2)
        }
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
        if (!this.adaptive || document.hidden) return
        if (measure.settle > 0) {
            measure.settle--
            return
        }
        let next = this.pixelRatio
        if (this.fps < FPS_LOW) next = Math.max(this.minPixelRatio, this.pixelRatio * 0.85)
        else if (this.fps > FPS_HIGH) next = Math.min(this.maxPixelRatio, this.pixelRatio + 0.1)
        if (Math.abs(next - this.pixelRatio) > 0.01) {
            this.pixelRatio = next
            this.game.events.trigger('quality:change')
        }
    }
}
