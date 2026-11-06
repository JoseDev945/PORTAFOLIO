import { Game } from './Game.js'
import { TickOrder } from './Ticker.js'

// Picks a quality preset and keeps the frame rate up by adjusting the render
// resolution on the fly (Bruno Simon's folio does the same kind of thing in Quality.js).
// Force a preset with ?quality=low or ?quality=high, show the FPS with ?fps.
// Triggers 'quality:change' when the resolution changes.
export class Quality {
    constructor() {
        this.game = Game.getInstance()
        const params = new URLSearchParams(window.location.search)
        const isMobile = window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600
        this.level = params.get('quality') ?? (isMobile ? 'low' : 'high')

        const devicePixelRatio = window.devicePixelRatio
        this.maxPixelRatio = this.level === 'high' ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 1)
        this.minPixelRatio = 0.6
        this.pixelRatio = this.maxPixelRatio
        // MSAA is costly on top of a high pixel ratio, skip it there
        this.antialias = this.level === 'high' && devicePixelRatio <= 1.5
        this.shadowMapSize = this.level === 'high' ? 2048 : 1024
        // ?quality=… pins the preset: no automatic resolution then
        this.forced = params.has('quality')
        this.applyResolution()
        this.game.events.on('settings:change', (key) => {
            if (key !== 'resolution') return
            this.applyResolution()
            this.game.events.trigger('quality:change')
        })

        this.frames = 0
        this.elapsed = 0
        this.fps = 60

        // FPS counter: "Mostrar FPS" in the pause menu, or always with ?fps / #debug
        this.counter = document.createElement('div')
        this.counter.className = 'fps'
        document.body.appendChild(this.counter)
        this.counterForced = params.has('fps') || window.location.hash === '#debug'
        this.display = { frames: 0, elapsed: 0 }
        this.showCounter()
        this.game.events.on('settings:change', (key) => key === 'showFps' && this.showCounter())

        this.game.ticker.on(() => this.update(this.game.ticker.delta), TickOrder.QUALITY)
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

    // Resolution setting from the pause menu: 'auto' adapts to the frame rate,
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
    }

    update(delta) {
        this.updateCounter(delta)
        this.frames++
        this.elapsed += delta
        if (this.elapsed < 1.5) return

        this.fps = this.frames / this.elapsed
        this.frames = 0
        this.elapsed = 0

        if (!this.adaptive || document.hidden) return
        let next = this.pixelRatio
        if (this.fps < 45) next = Math.max(this.minPixelRatio, this.pixelRatio * 0.85)
        else if (this.fps > 58) next = Math.min(this.maxPixelRatio, this.pixelRatio + 0.1)
        if (Math.abs(next - this.pixelRatio) > 0.01) {
            this.pixelRatio = next
            this.game.events.trigger('quality:change')
        }
    }
}
