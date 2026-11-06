import { Game } from '../Game.js'
import { keyLabel } from '../utils/keys.js'

// "F Sentarte · L Encender luces": what the on-board keys do right now
const ICONS = { character: '🚶', lights: '💡', fish: '🎣' }

export class CharacterPrompt {
    constructor() {
        this.game = Game.getInstance()
        this.element = document.getElementById('character-prompt')
        this.prompt = null
        // Each source (the character on deck, fishing) sends its own list; they're shown together
        this.sources = { character: null, fishing: null }
        for (const source of Object.keys(this.sources)) {
            this.game.events.on(`${source}:prompt`, (prompt) => {
                this.sources[source] = prompt
                const all = Object.values(this.sources).flatMap((list) => list ?? [])
                this.prompt = all.length ? all : null
                this.render()
            })
        }
        this.game.events.on('settings:change', (key) => key === 'bindings' && this.render())
        this.game.events.on('pause', () => this.render())
        this.game.events.on('start', () => this.render())
    }

    render() {
        const visible = Boolean(this.prompt) && this.game.playing
        this.element.classList.toggle('visible', visible)
        if (!this.prompt) return
        const parts = []
        this.prompt.forEach(({ action, label }, i) => {
            if (i > 0) parts.push(' · ')
            const kbd = document.createElement('kbd')
            kbd.className = 'desktop-only'
            kbd.textContent = keyLabel(this.game.inputs.keysFor(action)[0])
            const icon = document.createElement('span')
            icon.className = 'touch-only'
            icon.textContent = ICONS[action] ?? ''
            parts.push(kbd, icon, ` ${label}`)
        })
        this.element.replaceChildren(...parts)
    }
}
