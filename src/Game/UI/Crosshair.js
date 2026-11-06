import { Game } from '../Game.js'

// Shooter style crosshair in the center of the screen, in first person.
// It lights up when it points at something usable (a rod to take).
export class Crosshair {
    constructor() {
        this.game = Game.getInstance()
        this.element = document.getElementById('crosshair')
        const { events } = this.game
        for (const name of ['camera:change', 'pause', 'start']) events.on(name, () => this.render())
        events.on('fishing:aim', (aiming) => this.element.classList.toggle('aim', aiming))
        this.render()
    }

    render() {
        this.element.classList.toggle('visible', this.game.view.mode === 'first' && this.game.playing)
    }
}
