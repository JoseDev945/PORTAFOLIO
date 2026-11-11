import { Game } from '../Game.js'

// Keys that close a panel (besides Esc), like Minecraft's E
const CLOSE_KEYS = ['Escape', 'KeyE', 'KeyI', 'KeyF', 'Tab']

// A window over the game (inventory, shops). One at a time; while it's open
// the game keys are off (Inputs.blocked), the locked mouse is freed, and
// Esc / E / I / F close it. The game keeps running (it's multiplayer).
export class Panel {
    static current = null

    constructor(element) {
        this.game = Game.getInstance()
        this.element = element
        this.isOpen = false
        element.querySelector('.mc-close')?.addEventListener('click', () => this.close())
        // Clicking the dim background closes it
        element.addEventListener('click', (event) => event.target === element && this.close())
        window.addEventListener('keydown', (event) => {
            if (!this.isOpen || !CLOSE_KEYS.includes(event.code)) return
            event.preventDefault()
            event.stopImmediatePropagation()
            this.close()
        }, { capture: true })
        this.game.events.on('pause', (paused) => paused && this.close(false))
    }

    open() {
        if (Panel.current && Panel.current !== this) Panel.current.close(false)
        if (this.isOpen) {
            this.render()
            return
        }
        Panel.current = this
        this.isOpen = true
        const { inputs, view } = this.game
        inputs.blocked = true
        inputs.clear()
        this.relock = view.locked
        view.unlock()
        this.element.classList.add('visible')
        this.game.events.trigger('ui:click')
        this.render()
    }

    close(relock = true) {
        if (!this.isOpen) return
        this.isOpen = false
        if (Panel.current === this) Panel.current = null
        this.game.inputs.blocked = false
        this.element.classList.remove('visible')
        this.onClose?.()
        // Back to first person with the mouse locked, as it was
        const { view } = this.game
        if (relock && this.relock && view.mode === 'first' && this.game.playing) view.lock()
    }

    render() {}
}
