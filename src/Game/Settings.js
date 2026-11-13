import { Game } from './Game.js'

const STORAGE_KEY = 'portafolio-settings'

const defaults = {
    music: true,
    effects: true,
    mouseCamera: true,
    // Steering multiplier, 0.5 (soft) to 1.5 (sharp)
    steering: 1,
    // Boat chosen at the showroom (null = playerBoat from data/world.js)
    boat: null,
    // Camera mode: overview, behind, front or first (see View.js)
    camera: 'overview',
    // Keys changed by the player: { action: [key, key] } (null = defaults, see Inputs.js)
    bindings: null,
    // Render resolution, 0.01–1 of the screen's real one (fixed, it never changes by itself)
    resolution: 1,
    // No shadows, reflections or tilt-shift, same resolution (null = on in phones, see Quality.js)
    performance: null,
    // True once the player switched "Modo rendimiento" themselves; until then it starts on
    performanceChosen: false,
    // Real reflections of the world in the water (the most expensive effect)
    reflections: true,
    // FPS counter in the top right corner
    showFps: false,
    // Name shown to the other players in a room ('' = "Marinero NN")
    playerName: '',
    // Last room created or joined: its code is filled in to come back quickly
    lastRoom: ''
}

// Player preferences, remembered in this browser between visits.
// Triggers 'settings:change' (key, value). New settings: add a default here
// and an input with data-setting in the pause menu (checkbox or range).
export class Settings {
    constructor() {
        this.game = Game.getInstance()
        this.values = { ...defaults }
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}
            // Keep only stored values of the expected type (old or edited data can't break the game)
            for (const [key, value] of Object.entries(stored)) {
                if (key in defaults && (defaults[key] === null || typeof value === typeof defaults[key])) this.values[key] = value
            }
        } catch {
            // Storage blocked (private mode, etc.): keep defaults
        }
    }

    get(key) {
        return this.values[key]
    }

    set(key, value) {
        this.values[key] = value
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values))
        } catch {
            // Ignore, the setting still applies for this visit
        }
        this.game.events.trigger('settings:change', key, value)
    }
}
