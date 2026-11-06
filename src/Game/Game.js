import { Events } from './Events.js'
import { Ticker } from './Ticker.js'
import { Settings } from './Settings.js'
import { Diagnostics } from './Diagnostics.js'
import { Content } from './Content.js'
import { Quality } from './Quality.js'
import { Debug } from './Debug.js'
import { Inputs } from './Inputs.js'
import { Physics } from './Physics.js'
import { Rendering } from './Rendering.js'
import { View } from './View.js'
import { World } from './World/World.js'
import { Boat } from './Boat/Boat.js'
import { Character } from './Character/Character.js'
import { Wake } from './Boat/Wake.js'
import { Spray } from './Boat/Spray.js'
import { Audio } from './Audio.js'
import { UI } from './UI/UI.js'
import { Fishing } from './Fishing/Fishing.js'

// Lets the browser paint and handle input before the next boot step
const nextTask = () => globalThis.scheduler?.yield?.() ?? new Promise((resolve) => setTimeout(resolve, 0))

// User Timing: each call measures from the previous one (or from "boot")
let lastMark = 'boot'
const measure = (name) => {
    performance.mark(`${name}:end`)
    performance.measure(name, lastMark)
    lastMark = `${name}:end`
}

// Entry point and shared instance. Systems get it with Game.getInstance()
// (same pattern as Bruno Simon's folio) instead of receiving a dozen
// constructor arguments. Creation order matters: a system may only use the
// ones created before it.
export class Game {
    static instance = null

    static getInstance() {
        return Game.instance
    }

    // Builds in steps and gives the main thread back between them, so the
    // page keeps painting and answering while the world loads instead of
    // freezing for seconds. Each step shows up in DevTools/Lighthouse as a
    // "boot:…" User Timing measure.
    static async create(canvas) {
        performance.mark('boot')
        await Physics.init()
        measure('boot:physics')
        const game = new Game(canvas)
        await game.build()
        await game.rendering.init()
        measure('boot:renderer')
        game.rendering.renderer.setAnimationLoop(() => game.ticker.tick())
        performance.measure('boot:total', 'boot')
        return game
    }

    constructor(canvas) {
        Game.instance = this
        this.canvas = canvas
        this.state = { started: false, paused: false }
    }

    async build() {
        // Core
        this.events = new Events()
        this.ticker = new Ticker()
        this.diagnostics = new Diagnostics()
        this.content = new Content()
        this.settings = new Settings()
        this.quality = new Quality()
        this.debug = new Debug()
        this.inputs = new Inputs()
        this.physics = new Physics()
        this.rendering = new Rendering()
        this.view = new View()
        measure('boot:core')
        await nextTask()

        // Content
        this.world = new World()
        measure('boot:world')
        await nextTask()
        this.boat = new Boat()
        this.character = new Character()
        this.wake = new Wake()
        this.spray = new Spray()
        this.fishing = new Fishing()
        measure('boot:boat')
        await nextTask()

        // Output
        this.audio = new Audio()
        this.ui = new UI()

        this.setActions()
        measure('boot:ui')
        await nextTask()
    }

    // What each input action does depends on the game state, so it lives here
    setActions() {
        this.inputs.on('respawn', () => this.playing && this.boat.respawn())
        // Enter: act on the zone the boat is in (open a project, take a boat...)
        this.inputs.on('open', () => this.playing && this.events.trigger('interact', this.world.zones.active))
        this.inputs.on('map', () => this.playing && this.ui.map.toggle())
        this.inputs.on('camera', () => this.playing && this.view.nextMode())
        this.inputs.on('pause', () => {
            if (!this.state.started) return
            if (performance.now() - (this.view.unlockedAt ?? -1000) < 300) return
            if (this.ui.map.visible) this.ui.map.toggle(false)
            else this.setPaused(!this.state.paused)
        })
    }

    start() {
        if (this.state.started) return
        this.state.started = true
        this.events.trigger('start')
    }

    setPaused(paused) {
        if (!this.state.started || paused === this.state.paused) return
        this.state.paused = paused
        this.events.trigger('pause', paused)
    }

    // True when the player can drive (started, not paused)
    get playing() {
        return this.state.started && !this.state.paused
    }
}
