import { Game } from './Game.js'

// Order of the systems inside one frame, like the numbered game loop of Bruno
// Simon's folio. Gaps leave room to slot new systems in between.
export const TickOrder = {
    QUALITY: 0,
    PHYSICS: 10,
    BOAT: 20,
    CHARACTER: 25,
    WAKE: 30,
    ZONES: 40,
    VIEW: 50,
    WORLD: 60,
    AUDIO: 70,
    UI: 80,
    RENDER: 999
}

export class Ticker {
    constructor() {
        this.game = Game.getInstance()
        // Real time since the last frame, clamped so a frozen tab doesn't explode the physics
        this.delta = 1 / 60
        this.maxDelta = 0.1
        // Same, unclamped: what the frame really took (FPS counter, Quality)
        this.realDelta = 1 / 60
        // Game time: frozen while paused (waves, wake, physics...)
        this.elapsed = 0
        this.gameDelta = 0
        this.last = performance.now()
    }

    // Every system registers here: game.ticker.on(callback, TickOrder.X)
    on(callback, order) {
        return this.game.events.on('tick', callback, order)
    }

    tick() {
        const now = performance.now()
        this.realDelta = (now - this.last) / 1000
        this.delta = Math.min(this.realDelta, this.maxDelta)
        this.last = now
        this.gameDelta = this.game.state.paused ? 0 : this.delta
        this.elapsed += this.gameDelta
        this.game.events.trigger('tick')
    }
}
