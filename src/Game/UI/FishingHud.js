import { Game } from '../Game.js'

const TUB_SECONDS = 3.5

// Fishing messages ("¡Pargo rojo de 2,3 kg!") and the tub counter. The counter
// only shows for a few seconds when it changes or the game starts, so it
// doesn't stay in the way
export class FishingHud {
    constructor() {
        this.game = Game.getInstance()
        this.toastElement = document.getElementById('fish-toast')
        this.tubElement = document.getElementById('fish-hud')
        this.tub = null

        const { events } = this.game
        events.on('fishing:toast', (text) => this.toast(text))
        events.on('fishing:tub', (tub) => {
            const changed = JSON.stringify(tub) !== JSON.stringify(this.tub)
            this.tub = tub
            if (changed) this.flash()
            else this.render()
        })
        events.on('start', () => this.flash())
        events.on('pause', () => this.render())
        // Fishing was created before the UI: ask for its state once
        this.game.fishing?.emitTub()
    }

    // Shows the counter for a moment
    flash() {
        this.showing = true
        clearTimeout(this.tubTimeout)
        this.tubTimeout = setTimeout(() => {
            this.showing = false
            this.render()
        }, TUB_SECONDS * 1000)
        this.render()
    }

    render() {
        const visible = Boolean(this.tub) && this.game.playing && this.showing
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
