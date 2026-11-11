import { Panel } from './Panel.js'
import { RODS, formatCoins } from '../Fishing/catalog.js'
import { rodIcon } from './icons.js'

// Don Beto's rod shop at the port: every rod of data/rods.js with its shape,
// what it's good at and its price. Buying one equips it.
export class RodShop extends Panel {
    constructor() {
        super(document.getElementById('rod-shop'))
        this.list = document.getElementById('rod-list')
        this.coins = document.getElementById('rod-coins')
        this.message = document.getElementById('rod-message')
        this.game.events.on('station', (payload) => payload?.shop === 'rods' && this.open())
        this.game.events.on('inventory:change', () => this.isOpen && this.render())
    }

    open() {
        this.message.textContent = 'Pesca, vende en la pescadería y vuelve por una mejor'
        super.open()
    }

    render() {
        const inventory = this.game.inventory
        this.coins.textContent = formatCoins(inventory.coins)
        this.list.replaceChildren(...RODS.map((rod) => {
            const row = document.createElement('div')
            row.className = 'shop-row'
            const owned = inventory.rods.includes(rod.id)
            const inUse = inventory.rod === rod.id
            row.classList.toggle('in-use', inUse)

            const icon = document.createElement('img')
            icon.className = 'shop-icon'
            icon.src = rodIcon(rod)
            icon.alt = ''

            const info = document.createElement('div')
            info.className = 'shop-info'
            const name = document.createElement('strong')
            name.textContent = rod.name
            const description = document.createElement('p')
            description.textContent = rod.description
            const stats = document.createElement('div')
            stats.className = 'shop-stats'
            for (const [label, value] of [
                ['Suerte', rod.luck],
                ['Rapidez', (1 - rod.speed) / 0.45],
                ['Reflejos', (rod.window - 1) / 0.6]
            ]) {
                const text = document.createElement('span')
                text.textContent = label
                const bar = document.createElement('i')
                const fill = document.createElement('b')
                fill.style.width = `${Math.round(Math.min(1, Math.max(0.04, value)) * 100)}%`
                bar.append(fill)
                stats.append(text, bar)
            }
            info.append(name, description, stats)

            const button = document.createElement('button')
            button.className = 'shop-buy'
            if (inUse) {
                button.textContent = '✓ En uso'
                button.disabled = true
            } else if (owned) {
                button.textContent = 'Usar'
            } else {
                button.textContent = formatCoins(rod.price)
                const missing = rod.price - inventory.coins
                if (missing > 0) {
                    button.disabled = true
                    button.title = `Te faltan ${formatCoins(missing)}`
                    button.classList.add('poor')
                }
            }
            button.addEventListener('click', () => this.buy(rod))
            row.append(icon, info, button)
            return row
        }))
    }

    buy(rod) {
        const result = this.game.inventory.buy(rod.id)
        if (result === 'bought') {
            this.message.textContent = `¡Compraste la ${rod.name}! Ya la tienes en la mano`
            this.game.events.trigger('sfx', 'coins')
        } else if (result === 'equipped') {
            this.message.textContent = `Ahora pescas con la ${rod.name}`
            this.game.events.trigger('ui:click')
        } else if (result === 'poor') {
            this.message.textContent = `Te faltan ${formatCoins(rod.price - this.game.inventory.coins)}`
        }
    }
}
