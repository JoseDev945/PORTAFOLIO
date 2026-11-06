import { Game } from '../Game.js'
import { ACTION_LABELS, REBINDABLE } from '../Inputs.js'
import { keyLabel } from '../utils/keys.js'

// "Controles" page of the pause menu: two key slots per action. Click a
// slot, press the new key (Esc cancels). A key already used by another
// action moves to this one, and the message says where it came from.
export class ControlsPanel {
    constructor() {
        this.game = Game.getInstance()
        this.pauseCard = document.querySelector('#pause .pause-card')
        this.card = document.getElementById('controls-card')
        this.list = document.getElementById('controls-list')
        this.message = document.getElementById('controls-message')
        this.waiting = null

        document.getElementById('controls-button').addEventListener('click', () => this.open())
        document.getElementById('controls-back').addEventListener('click', () => this.close())
        document.getElementById('controls-reset').addEventListener('click', () => {
            this.game.inputs.resetBindings()
            this.say('Controles restablecidos')
        })

        // Capture phase on window: runs before the game's own key handling,
        // so the key being assigned never also triggers its old action
        window.addEventListener('keydown', (event) => this.onKey(event), { capture: true })
        this.game.events.on('settings:change', (key) => key === 'bindings' && this.render())
        this.game.events.on('pause', (paused) => !paused && this.close())
    }

    get isOpen() {
        return !this.card.hidden
    }

    open() {
        this.pauseCard.hidden = true
        this.card.hidden = false
        this.say('')
        this.render()
        this.list.querySelector('button')?.focus()
    }

    close() {
        this.stopWaiting()
        this.card.hidden = true
        this.pauseCard.hidden = false
        document.getElementById('controls-button').focus()
    }

    render() {
        const { inputs } = this.game
        this.list.replaceChildren(...REBINDABLE.map((action) => {
            const row = document.createElement('div')
            row.className = 'controls-row'
            const name = document.createElement('span')
            name.textContent = ACTION_LABELS[action]
            row.appendChild(name)
            inputs.bindings[action].forEach((code, slot) => {
                const button = document.createElement('button')
                button.className = 'key-slot'
                button.textContent = keyLabel(code)
                button.setAttribute('aria-label', `${ACTION_LABELS[action]}, tecla ${slot + 1}: ${code ? keyLabel(code) : 'ninguna'}`)
                if (this.waiting?.action === action && this.waiting.slot === slot) {
                    button.classList.add('waiting')
                    button.textContent = 'Presiona…'
                }
                button.addEventListener('click', () => this.startWaiting(action, slot))
                row.appendChild(button)
            })
            return row
        }))
    }

    startWaiting(action, slot) {
        this.waiting = { action, slot }
        this.game.inputs.capturing = true
        this.say(`Presiona la tecla para "${ACTION_LABELS[action]}"`)
        this.render()
    }

    stopWaiting() {
        this.waiting = null
        this.game.inputs.capturing = false
    }

    onKey(event) {
        if (!this.isOpen) return
        if (!this.waiting) {
            // Esc on this page goes back to the pause menu instead of resuming the game
            if (event.code === 'Escape') {
                event.preventDefault()
                event.stopImmediatePropagation()
                this.close()
            }
            return
        }

        event.preventDefault()
        event.stopImmediatePropagation()
        const { action, slot } = this.waiting
        this.stopWaiting()
        if (event.code === 'Escape') {
            this.say('Cancelado')
            this.render()
            return
        }
        // Backspace / Delete clear the slot
        const code = event.code === 'Backspace' || event.code === 'Delete' ? null : event.code
        const displaced = this.game.inputs.rebind(action, slot, code)
        if (code === null) this.say(`"${ACTION_LABELS[action]}": tecla quitada`)
        else if (displaced) this.say(`${keyLabel(code)} ahora es "${ACTION_LABELS[action]}" (antes era "${ACTION_LABELS[displaced]}")`)
        else this.say(`${keyLabel(code)} asignada a "${ACTION_LABELS[action]}"`)
        this.render()
    }

    say(text) {
        this.message.textContent = text
    }
}
