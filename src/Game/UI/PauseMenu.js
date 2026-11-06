import { Game } from '../Game.js'

// Pause overlay with the settings. Every input with data-setting="key"
// (checkbox, range slider or select) is bound to game.settings automatically.
export class PauseMenu {
    constructor() {
        this.game = Game.getInstance()
        this.element = document.getElementById('pause')
        this.resumeButton = document.getElementById('resume-button')

        for (const input of this.element.querySelectorAll('input[data-setting], select[data-setting]')) {
            const key = input.dataset.setting
            if (input.tagName === 'SELECT') {
                input.value = String(this.game.settings.get(key))
                input.addEventListener('change', () => this.game.settings.set(key, input.value))
            } else if (input.type === 'range') {
                // Applies live while dragging; an <output for="id"> shows the value
                const output = this.element.querySelector(`output[for="${input.id}"]`)
                const show = () => output && (output.textContent = `${Math.round(input.value * 100)}%`)
                input.value = this.game.settings.get(key)
                show()
                input.addEventListener('input', () => {
                    this.game.settings.set(key, Number(input.value))
                    show()
                })
            } else {
                input.checked = this.game.settings.get(key)
                input.addEventListener('change', () => this.game.settings.set(key, input.checked))
            }
        }

        // "Modo rendimiento" turns reflections off whatever this toggle says
        document.getElementById('reflections-input').disabled = !this.game.quality.preset.reflections

        this.resumeButton.addEventListener('click', () => this.game.setPaused(false))
        document.getElementById('pause-button').addEventListener('click', () => this.game.setPaused(true))
        // Clicking the dimmed background also resumes
        this.element.addEventListener('click', (event) => {
            if (event.target === this.element) this.game.setPaused(false)
        })

        this.game.events.on('pause', (paused) => this.show(paused))
    }

    show(visible) {
        this.element.classList.toggle('visible', visible)
        if (visible) this.resumeButton.focus()
        else document.activeElement?.blur()
    }
}
