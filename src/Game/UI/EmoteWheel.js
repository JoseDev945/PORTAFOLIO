import { Game } from '../Game.js'
import { EMOTES } from '../Network/emoteList.js'

// T opens a ring of emotes in the middle of the screen: click one or press
// its number (1–8). The emote floats big over your boat, for everyone in the
// room. T again or Esc closes it.
export class EmoteWheel {
    constructor() {
        this.game = Game.getInstance()
        this.element = document.getElementById('emote-wheel')
        this.isOpen = false

        const buttons = EMOTES.map(({ emoji, label }, index) => {
            const button = document.createElement('button')
            button.className = 'emote-option'
            button.style.setProperty('--angle', `${(index / EMOTES.length) * 360 - 90}deg`)
            button.setAttribute('aria-label', label)
            button.title = label
            const key = document.createElement('kbd')
            key.className = 'desktop-only'
            key.textContent = String(index + 1)
            button.append(emoji, key)
            button.addEventListener('click', () => this.choose(index))
            return button
        })
        const center = document.createElement('div')
        center.className = 'emote-center'
        center.textContent = 'Emotes'
        this.element.replaceChildren(center, ...buttons)
        this.element.addEventListener('click', (event) => event.target === this.element && this.close())

        this.game.inputs.on('emote', () => this.game.playing && this.toggle())
        this.game.events.on('pause', (paused) => paused && this.close())
        // Capture phase: the number keys and Esc are the wheel's while it's open
        window.addEventListener('keydown', (event) => {
            if (!this.isOpen) return
            const number = /^(Digit|Numpad)([1-9])$/.exec(event.code)
            if (number && EMOTES[number[2] - 1]) {
                event.preventDefault()
                event.stopImmediatePropagation()
                this.choose(number[2] - 1)
            } else if (event.code === 'Escape') {
                event.preventDefault()
                event.stopImmediatePropagation()
                this.close()
            }
        }, { capture: true })
    }

    toggle() {
        if (this.isOpen) this.close()
        else this.open()
    }

    open() {
        this.isOpen = true
        // A locked mouse (first person) is freed so the emotes can be clicked
        this.game.view.unlock()
        this.element.classList.add('visible')
    }

    close() {
        this.isOpen = false
        this.element.classList.remove('visible')
    }

    choose(index) {
        this.game.network.emote(index)
        this.close()
    }
}
