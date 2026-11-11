import { Game } from '../Game.js'
import { playerColor } from '../utils/players.js'
import { MAX_TEXT } from '../Network/Network.js'
import { isTouch } from '../Inputs.js'

// How long a line stays on screen after it arrives while the chat is closed (ms)
const VISIBLE_FOR = 10000
const MAX_LINES = 60

// Chat in the bottom right corner, like League of Legends: Enter opens the
// box, Enter sends, Esc cancels. New lines show for a few seconds and fade;
// with the box open the whole history is there (scrollable).
export class Chat {
    constructor() {
        this.game = Game.getInstance()
        this.element = document.getElementById('chat')
        this.log = document.getElementById('chat-log')
        this.input = document.getElementById('chat-input')
        this.sendButton = document.getElementById('chat-send')
        this.input.maxLength = MAX_TEXT
        this.isOpen = false

        this.game.inputs.on('chat', () => this.game.playing && this.open())
        this.input.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'NumpadEnter') {
                event.preventDefault()
                this.submit()
            } else if (event.code === 'Escape') {
                // Only closes the chat: never reaches the pause menu
                event.preventDefault()
                event.stopPropagation()
                this.close()
            }
        })
        // Touch screens: the ➤ button sends (pointerdown, before the input loses focus)
        this.sendButton.addEventListener('pointerdown', (event) => {
            event.preventDefault()
            this.submit()
        })
        // Tapping or clicking elsewhere closes it
        this.input.addEventListener('blur', () => this.close())

        const { events } = this.game
        events.on('chat:message', (message) => this.add(message))
        events.on('pause', (paused) => paused && this.close())
        // Lift above the project / boat card when one shows (same corner)
        for (const name of ['zone:change', 'start', 'ui:click']) events.on(name, () => this.avoidCards())
        window.addEventListener('resize', () => this.avoidCards())
    }

    open() {
        if (this.isOpen) return
        this.isOpen = true
        // Keys held for driving would stay stuck while typing
        this.game.inputs.clear()
        // A locked mouse (first person) is freed, without pausing
        this.game.view.unlock()
        this.element.classList.add('open')
        this.input.value = ''
        this.input.focus()
        this.log.scrollTop = this.log.scrollHeight
    }

    close() {
        if (!this.isOpen) return
        this.isOpen = false
        this.element.classList.remove('open')
        this.input.blur()
        this.log.scrollTop = this.log.scrollHeight
    }

    submit() {
        const text = this.input.value
        this.input.value = ''
        this.close()
        if (text.trim()) this.game.network.say(text)
    }

    add({ slot, name, text, system }) {
        const line = document.createElement('div')
        line.className = system ? 'chat-line system' : 'chat-line'
        if (!system) {
            const who = document.createElement('span')
            who.className = 'chat-name'
            who.style.color = playerColor(slot)
            who.textContent = `${name}: `
            line.append(who)
        }
        // Text nodes only: whatever someone writes is never HTML
        line.append(text)
        this.log.append(line)
        while (this.log.children.length > MAX_LINES) this.log.firstChild.remove()
        this.log.scrollTop = this.log.scrollHeight
        setTimeout(() => line.classList.add('old'), VISIBLE_FOR)
    }

    // On desktop the project and boat cards live in the same corner
    avoidCards() {
        requestAnimationFrame(() => {
            let lift = 0
            if (!isTouch()) {
                for (const card of document.querySelectorAll('.project-card.visible')) lift = Math.max(lift, card.offsetHeight + 12)
            }
            this.element.style.setProperty('--card-lift', `${lift}px`)
        })
    }
}
