import { Game } from './Game.js'
import { capturePointer } from './utils/pointer.js'

// Every control is an action. These are the default keys (two per action);
// players can change them in the pause menu (saved in settings.bindings).
// Adding a new action: a line here, a label below, and HTML buttons with
// data-action / data-hold for touch screens.
export const ACTIONS = {
    forward: ['KeyW', 'ArrowUp'],
    backward: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    boost: ['ShiftLeft', 'ShiftRight'],
    respawn: ['KeyR', null],
    map: ['Tab', 'KeyM'],
    open: ['Enter', 'KeyE'],
    // Like Minecraft's F5
    camera: ['KeyC', 'F5'],
    // On boats with a walkable deck: get up, sit down, take the helm
    character: ['KeyF', null],
    // Cabin lights (at the helm of boats that have them)
    lights: ['KeyL', null],
    // Cast / reel in, on boats with rod holders (also right click, like Minecraft)
    fish: ['KeyG', null],
    // Fixed: Esc always opens the menu, so you can never lock yourself out
    pause: ['Escape', null]
}

export const ACTION_LABELS = {
    forward: 'Avanzar',
    backward: 'Retroceder',
    left: 'Girar a la izquierda',
    right: 'Girar a la derecha',
    boost: 'Turbo',
    respawn: 'Reaparecer',
    map: 'Mapa',
    open: 'Abrir proyecto / usar bote',
    camera: 'Cambiar cámara',
    character: 'Caminar / sentarse / tomar el timón',
    lights: 'Luces del bote',
    fish: 'Pescar / recoger el sedal',
    pause: 'Pausa'
}

// Actions the player can rebind (all but pause)
export const REBINDABLE = Object.keys(ACTIONS).filter((action) => action !== 'pause')

// True while the on-screen touch controls are shown (see Inputs.setupTouchMode)
export const isTouch = () => document.documentElement.classList.contains('touch')

// Keys whose browser default (focus, scroll, reload…) must not happen when bound
const BROWSER_KEYS = /^(Tab|Space|F\d+|Arrow\w+|Backspace)$/

export class Inputs {
    constructor() {
        this.game = Game.getInstance()
        // Actions currently held down (from the keyboard or touch buttons)
        this.down = new Set()
        this.touch = { active: false, x: 0, y: 0, id: null }
        // While true (rebinding a key in the menu) the game ignores the keyboard
        this.capturing = false
        this.applyBindings()

        window.addEventListener('keydown', (event) => {
            if (this.capturing) return
            const action = this.actionByKey.get(event.code)
            if (!action) return
            // In menus Tab must keep moving the focus; otherwise the game owns bound keys
            if (BROWSER_KEYS.test(event.code) && (!this.game.state.paused || event.code !== 'Tab')) event.preventDefault()
            if (!event.repeat) this.press(action)
        })
        window.addEventListener('keyup', (event) => {
            const action = this.actionByKey.get(event.code)
            if (action) this.down.delete(action)
        })
        window.addEventListener('blur', () => this.clear())
        this.game.events.on('pause', () => this.clear())
        this.game.events.on('settings:change', (key) => key === 'bindings' && this.applyBindings())

        this.setupTouchMode()
        this.setupTouchControls()
    }

    // Defaults + what the player changed, validated (old or edited saves can't break the controls)
    applyBindings() {
        const saved = this.game.settings.get('bindings')
        this.bindings = structuredClone(ACTIONS)
        if (saved && typeof saved === 'object') {
            for (const action of REBINDABLE) {
                const keys = saved[action]
                if (Array.isArray(keys) && keys.length === 2 && keys.every((key) => key === null || typeof key === 'string')) {
                    this.bindings[action] = [...keys]
                }
            }
        }
        this.actionByKey = new Map()
        for (const [action, keys] of Object.entries(this.bindings)) {
            for (const key of keys) if (key && !this.actionByKey.has(key)) this.actionByKey.set(key, action)
        }
        this.clear()
    }

    // Assigns `code` to one of the two slots of `action`. A key does one thing
    // only: if another action had it, it's removed there. Returns that action.
    rebind(action, slot, code) {
        const bindings = structuredClone(this.bindings)
        let displaced = null
        if (code) {
            for (const other of REBINDABLE) {
                for (let i = 0; i < 2; i++) {
                    if (bindings[other][i] !== code || (other === action && i === slot)) continue
                    bindings[other][i] = null
                    if (other !== action) displaced = other
                }
            }
        }
        bindings[action][slot] = code
        this.game.settings.set('bindings', Object.fromEntries(REBINDABLE.map((name) => [name, bindings[name]])))
        return displaced
    }

    resetBindings() {
        this.game.settings.set('bindings', null)
    }

    keysFor(action) {
        return this.bindings[action].filter(Boolean)
    }

    // Listen to an action being pressed: inputs.on('map', callback)
    on(action, callback) {
        return this.game.events.on(`action:${action}`, callback)
    }

    press(action) {
        this.down.add(action)
        this.game.events.trigger(`action:${action}`)
    }

    isDown(action) {
        return this.down.has(action)
    }

    // Touch mode shows the on-screen controls. It turns on with a coarse
    // pointer at load, or with the first touch on hybrid devices, and off
    // again when the player uses the keyboard.
    setupTouchMode() {
        const setTouch = (touch) => document.documentElement.classList.toggle('touch', touch)
        setTouch(window.matchMedia('(pointer: coarse)').matches)
        window.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'touch') setTouch(true)
        }, { capture: true })
        window.addEventListener('keydown', (event) => {
            if (event.code !== 'Escape') setTouch(false)
        })
    }

    setupTouchControls() {
        const stick = document.getElementById('stick')
        const knob = document.getElementById('stick-knob')
        const deadZone = 0.15

        const moveStick = (event) => {
            const rect = stick.getBoundingClientRect()
            const radius = rect.width / 2
            let dx = event.clientX - (rect.left + radius)
            let dy = event.clientY - (rect.top + radius)
            const distance = Math.hypot(dx, dy)
            if (distance > radius) {
                dx *= radius / distance
                dy *= radius / distance
            }
            knob.style.transform = `translate(${dx}px, ${dy}px)`
            const x = dx / radius
            const y = dy / radius
            this.touch.x = Math.abs(x) < deadZone ? 0 : x
            this.touch.y = Math.abs(y) < deadZone ? 0 : y
        }
        const releaseStick = (event) => {
            if (event.pointerId !== this.touch.id) return
            this.touch.active = false
            this.touch.id = null
            this.touch.x = 0
            this.touch.y = 0
            knob.style.transform = ''
            stick.classList.remove('active')
        }

        stick.addEventListener('pointerdown', (event) => {
            if (this.touch.active) return
            event.preventDefault()
            capturePointer(stick, event.pointerId)
            this.touch.active = true
            this.touch.id = event.pointerId
            stick.classList.add('active')
            moveStick(event)
        })
        stick.addEventListener('pointermove', (event) => {
            if (event.pointerId === this.touch.id) moveStick(event)
        })
        stick.addEventListener('pointerup', releaseStick)
        stick.addEventListener('pointercancel', releaseStick)

        // data-action buttons fire once on press, data-hold buttons stay down while pressed
        for (const button of document.querySelectorAll('.touch-button')) {
            const action = button.dataset.action ?? button.dataset.hold
            const hold = 'hold' in button.dataset
            button.addEventListener('pointerdown', (event) => {
                event.preventDefault()
                capturePointer(button, event.pointerId)
                button.classList.add('pressed')
                this.press(action)
                if (!hold) this.down.delete(action)
            })
            const release = () => {
                button.classList.remove('pressed')
                this.down.delete(action)
            }
            button.addEventListener('pointerup', release)
            button.addEventListener('pointercancel', release)
            button.addEventListener('contextmenu', (event) => event.preventDefault())
        }
    }

    get throttle() {
        let value = 0
        if (this.isDown('forward')) value += 1
        if (this.isDown('backward')) value -= 1
        if (this.touch.active) value -= this.touch.y
        return Math.max(-1, Math.min(1, value))
    }

    get steer() {
        let value = 0
        if (this.isDown('left')) value += 1
        if (this.isDown('right')) value -= 1
        if (this.touch.active) value -= this.touch.x
        return Math.max(-1, Math.min(1, value))
    }

    get boost() {
        return this.isDown('boost')
    }

    clear() {
        this.down.clear()
    }
}
