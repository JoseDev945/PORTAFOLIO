import { Game } from '../Game.js'
import { formatCoins } from '../Fishing/catalog.js'

// Your coins under the title, with a little bump when they change
export class CoinsHud {
    constructor() {
        this.game = Game.getInstance()
        this.element = document.getElementById('hud-coins')
        this.coins = null
        this.game.events.on('inventory:change', () => this.render())
        this.render()
    }

    render() {
        const coins = this.game.inventory.coins
        if (coins === this.coins) return
        const first = this.coins === null
        this.coins = coins
        this.element.textContent = formatCoins(coins)
        if (first) return
        this.element.classList.remove('bump')
        // Restart the animation
        void this.element.offsetWidth
        this.element.classList.add('bump')
    }
}
