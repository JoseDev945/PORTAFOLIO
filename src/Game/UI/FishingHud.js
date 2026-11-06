import { Game } from '../Game.js'

// Fishing messages ("¡Pargo rojo de 2,3 kg!") and the tub counter, shown
// while the boat has fishing gear
export class FishingHud {
    constructor() {
        this.game = Game.getInstance()
        this.toastElement = document.getElementById('fish-toast')
        this.tubElement = document.getElementById('fish-hud')
        this.tub = null

        const { events } = this.game
        events.on('fishing:toast', (text) => this.toast(text))
        events.on('fishing:tub', (tub) => {
            this.tub = tub
            this.render()
        })
        events.on('start', () => this.render())
        events.on('pause', () => this.render())
        // Fishing was created before the UI: ask for its state once
        this.game.fishing?.emitTub()
    }

    render() {
        const visible = Boolean(this.tub) && this.game.playing
        this.tubElement.classList.toggle('visible', visible)
        if (!this.tub) return
        const { count, best } = this.tub
        const fish = count === 1 ? 'pez' : 'peces'
        this.tubElement.textContent = `🐟 Tina: ${count} ${fish}${best ? ` · Récord: ${best.name} ${best.kg.toLocaleString('es')} kg` : ''}`
    }

    toast(text) {
        this.toastElement.textContent = text
        this.toastElement.classList.add('visible')
        clearTimeout(this.timeout)
        this.timeout = setTimeout(() => this.toastElement.classList.remove('visible'), 2600)
    }
}
