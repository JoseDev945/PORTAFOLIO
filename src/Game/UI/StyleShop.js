import { Panel } from './Panel.js'
import { SKINS, HATS, formatCoins } from '../Fishing/catalog.js'
import { skinIcon, hatIcon } from './icons.js'

// Lupita's clothing stall at the port: skins (coveralls) and hats.
// Buying one puts it on; the others in the room see it.
export class StyleShop extends Panel {
    constructor() {
        super(document.getElementById('style-shop'))
        this.list = document.getElementById('style-list')
        this.coins = document.getElementById('style-coins')
        this.message = document.getElementById('style-message')
        this.game.events.on('station', (payload) => payload?.shop === 'style' && this.open())
        this.game.events.on('inventory:change', () => this.isOpen && this.render())
    }

    open() {
        this.message.textContent = 'Lo que compras te lo pones. Cámbiate en el inventario (E)'
        super.open()
    }

    section(title) {
        const heading = document.createElement('div')
        heading.className = 'mc-label'
        heading.textContent = title
        return heading
    }

    row(kind, item, icon) {
        const inventory = this.game.inventory
        const owned = (kind === 'skin' ? inventory.skins : inventory.hats).includes(item.id)
        const worn = inventory[kind] === item.id
        const row = document.createElement('div')
        row.className = 'shop-row'
        row.classList.toggle('in-use', worn)
        const image = document.createElement('img')
        image.className = 'shop-icon'
        image.src = icon
        image.alt = ''
        const info = document.createElement('div')
        info.className = 'shop-info'
        const name = document.createElement('strong')
        name.textContent = item.name
        info.append(name)
        const button = document.createElement('button')
        button.className = 'shop-buy'
        if (worn) button.textContent = kind === 'skin' && item.id === inventory.skins[0] ? '✓ Puesto' : 'Quitar'
        else if (owned) button.textContent = 'Ponerse'
        else {
            button.textContent = item.price ? formatCoins(item.price) : 'Gratis'
            if (item.price > inventory.coins) {
                button.disabled = true
                button.classList.add('poor')
            }
        }
        if (worn && kind === 'skin') button.disabled = item.id === inventory.skins[0]
        button.addEventListener('click', () => this.buy(kind, item))
        row.append(image, info, button)
        return row
    }

    render() {
        this.coins.textContent = formatCoins(this.game.inventory.coins)
        this.list.replaceChildren(
            this.section('Trajes'),
            ...SKINS.map((skin) => this.row('skin', skin, skinIcon(skin))),
            this.section('Sombreros'),
            ...HATS.map((hat) => this.row('hat', hat, hatIcon(hat)))
        )
    }

    buy(kind, item) {
        const result = this.game.inventory.buyClothes(kind, item.id)
        if (result === 'bought') {
            this.message.textContent = `¡Te queda bien ${item.name.toLowerCase()}!`
            this.game.events.trigger('sfx', 'coins')
        } else if (result === 'poor') {
            this.message.textContent = `Te faltan ${formatCoins(item.price - this.game.inventory.coins)}`
        } else this.game.events.trigger('ui:click')
    }
}
