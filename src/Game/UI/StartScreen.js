import { Game } from '../Game.js'

// "Zarpar" overlay. The button unlocks once everything is loaded; clicking
// it starts the game (and audio, which browsers only allow after a gesture).
export class StartScreen {
    constructor() {
        this.game = Game.getInstance()
        this.element = document.getElementById('start')
        this.button = document.getElementById('start-button')
    }

    ready() {
        this.button.disabled = false
        this.button.textContent = 'Zarpar ⛵'
        this.button.addEventListener('click', () => {
            this.element.classList.add('hidden')
            this.game.start()
        }, { once: true })
    }
}
