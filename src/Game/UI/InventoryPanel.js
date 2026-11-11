import { Panel } from './Panel.js'
import { RODS, SKINS, speciesById, rarityOf, formatCoins, skinById, hatById } from '../Fishing/catalog.js'
import { fishIcon, rodIcon, skinIcon, hatIcon, portrait } from './icons.js'
import { isTouch } from '../Inputs.js'

const COLUMNS = 9
const ROWS = 4

// Your catch, Minecraft style: 9×4 slots, one stack per species (up to 64),
// a tooltip with the rarity, weight and value, and your rods below (click
// one to fish with it). Opened with F on the boat's tub, I anywhere, or at
// the fish market, where clicking a stack sells it ('sell' mode).
export class InventoryPanel extends Panel {
    constructor() {
        super(document.getElementById('inventory'))
        const $ = (id) => document.getElementById(id)
        this.title = $('inventory-title')
        this.coins = $('inventory-coins')
        this.grid = $('inventory-grid')
        this.rodGrid = $('inventory-rods')
        this.character = $('inventory-character')
        this.portrait = $('inventory-portrait')
        this.equip = $('inventory-equip')
        this.clothes = $('inventory-clothes')
        this.footer = $('inventory-footer')
        this.hint = $('inventory-hint')
        this.sellAll = $('inventory-sell-all')
        this.tooltip = $('mc-tooltip')
        this.mode = 'view'

        this.sellAll.addEventListener('click', () => this.sell(null))
        this.element.addEventListener('mousemove', (event) => this.moveTooltip(event))
        const { events, inputs } = this.game
        events.on('inventory:change', () => this.isOpen && this.render())
        inputs.on('inventory', () => {
            if (!this.game.playing) return
            if (this.isOpen) this.close()
            else this.open('view')
        })
        events.on('station', (payload) => payload?.shop === 'fish' && this.open('sell'))
    }

    open(mode = 'view') {
        this.mode = mode
        this.say('')
        super.open()
    }

    onClose() {
        this.hideTooltip()
    }

    say(text) {
        this.footer.dataset.message = text
        if (text) this.footer.textContent = text
    }

    slot(content) {
        const slot = document.createElement('button')
        slot.className = 'mc-slot'
        slot.type = 'button'
        if (!content) {
            slot.disabled = true
            slot.tabIndex = -1
            return slot
        }
        const image = document.createElement('img')
        image.src = content.icon
        image.alt = ''
        slot.append(image)
        if (content.count > 1) {
            const count = document.createElement('span')
            count.className = 'mc-count'
            count.textContent = content.count
            slot.append(count)
        }
        if (content.selected) slot.classList.add('selected')
        slot.setAttribute('aria-label', content.label)
        slot.addEventListener('mouseenter', (event) => this.showTooltip(content.lines, event))
        slot.addEventListener('mouseleave', () => this.hideTooltip())
        slot.addEventListener('focus', () => this.showTooltip(content.lines, null, slot))
        slot.addEventListener('blur', () => this.hideTooltip())
        slot.addEventListener('click', () => {
            // Touch screens have no hover: the first tap shows what it is
            if (isTouch() && this.tooltipFor !== slot) {
                this.showTooltip(content.lines, null, slot)
                if (!content.instant) return
            }
            content.onClick?.()
        })
        return slot
    }

    render() {
        const inventory = this.game.inventory
        const selling = this.mode === 'sell'
        this.element.classList.toggle('selling', selling)
        this.title.textContent = selling ? 'Pescadería · Doña Marta' : 'Inventario'
        this.coins.textContent = formatCoins(inventory.coins)
        this.hint.textContent = selling ? 'Clic en un pescado para venderlo' : 'Vende en la pescadería del puerto'

        // Fish stacks
        const stacks = inventory.stacks()
        const slots = []
        for (let i = 0; i < COLUMNS * ROWS; i++) {
            const stack = stacks[i]
            if (!stack) {
                slots.push(this.slot(null))
                continue
            }
            const { species, count, kg, value, biggest } = stack
            const rarity = rarityOf(species)
            slots.push(this.slot({
                icon: fishIcon(species),
                count,
                label: `${species.name}, ${count}`,
                lines: [
                    { text: species.name, color: rarity.color, big: true },
                    { text: rarity.name, color: rarity.color },
                    { text: `×${count} · ${kg.toLocaleString('es', { maximumFractionDigits: 1 })} kg` },
                    { text: `El más grande: ${biggest.toLocaleString('es')} kg` },
                    { text: `Vale ${formatCoins(value)}`, color: '#ffe08a' },
                    ...(selling ? [{ text: isTouch() ? 'Toca otra vez para vender' : 'Clic para vender', color: '#9fe2ff' }] : [])
                ],
                onClick: selling ? () => this.sell(species.id) : null
            }))
        }
        this.grid.replaceChildren(...slots)

        // Rods (hotbar): the one in use is highlighted
        const rodSlots = []
        for (let i = 0; i < COLUMNS; i++) {
            const rod = RODS.find((item) => item.id === inventory.rods[i])
            if (!rod) {
                rodSlots.push(this.slot(null))
                continue
            }
            const inUse = inventory.rod === rod.id
            rodSlots.push(this.slot({
                icon: rodIcon(rod),
                count: 1,
                selected: inUse,
                instant: true,
                label: rod.name,
                lines: [
                    { text: rod.name, color: '#ffffff', big: true },
                    { text: rod.description },
                    { text: inUse ? '✓ La estás usando' : 'Clic para usarla', color: inUse ? '#6cf06c' : '#9fe2ff' }
                ],
                onClick: () => inventory.equip(rod.id)
            }))
        }
        this.rodGrid.replaceChildren(...rodSlots)
        this.renderCharacter(selling)

        // Summary (unless a sale message is showing)
        const count = inventory.fish.length
        this.sellAll.hidden = !selling
        this.sellAll.disabled = count === 0
        this.sellAll.textContent = count ? `Vender todo (+${formatCoins(inventory.totalValue)})` : 'No tienes pescados'
        if (!this.footer.dataset.message) {
            const best = inventory.stats.best
            const bestSpecies = best && speciesById(best.id)
            this.footer.textContent = count
                ? `${count} ${count === 1 ? 'pescado' : 'pescados'} · valen ${formatCoins(inventory.totalValue)}${bestSpecies ? ` · Récord: ${bestSpecies.name} de ${best.kg.toLocaleString('es')} kg` : ''}`
                : 'Todavía no tienes pescados: pesca con la Corvina 250 (clic derecho en primera persona)'
        }
    }

    // Your character: portrait, what you wear (click = take it off) and your clothes (click = put on)
    renderCharacter(selling) {
        const inventory = this.game.inventory
        this.character.hidden = selling
        for (const element of this.element.querySelectorAll('.mc-clothes-label, #inventory-clothes')) element.hidden = selling
        if (selling) return
        const skin = skinById(inventory.skin) ?? SKINS[0]
        const hat = hatById(inventory.hat)
        this.portrait.src = portrait(skin, hat)
        const piece = (kind, item, icon, worn) => this.slot({
            icon,
            count: 1,
            selected: worn,
            instant: true,
            label: item.name,
            lines: [
                { text: item.name, color: '#ffffff', big: true },
                { text: worn ? (kind === 'skin' && item.id === SKINS[0].id ? '✓ Puesto' : 'Clic para quitártelo') : 'Clic para ponértelo', color: worn ? '#6cf06c' : '#9fe2ff' }
            ],
            onClick: () => inventory.wear(kind, item.id)
        })
        const empty = (text) => {
            const slot = this.slot(null)
            slot.title = text
            slot.classList.add('mc-empty-hat')
            return slot
        }
        this.equip.replaceChildren(
            hat ? piece('hat', hat, hatIcon(hat), true) : empty('Sin sombrero'),
            piece('skin', skin, skinIcon(skin), true)
        )
        const owned = [
            ...inventory.skins.map((id) => ['skin', skinById(id)]),
            ...inventory.hats.map((id) => ['hat', hatById(id)])
        ].filter(([, item]) => item)
        const slots = []
        for (let i = 0; i < 9; i++) {
            const entry = owned[i]
            if (!entry) {
                slots.push(this.slot(null))
                continue
            }
            const [kind, item] = entry
            slots.push(piece(kind, item, kind === 'skin' ? skinIcon(item) : hatIcon(item), inventory[kind] === item.id))
        }
        this.clothes.replaceChildren(...slots)
    }

    sell(id) {
        const { count, coins } = this.game.inventory.sell(id)
        this.hideTooltip()
        if (!count) return
        const name = id ? speciesById(id)?.name : null
        this.say(`Vendiste ${count} ${name ?? (count === 1 ? 'pescado' : 'pescados')} por ${formatCoins(coins)}`)
        this.game.events.trigger('sfx', 'coins')
        this.render()
    }

    showTooltip(lines, event, anchor = null) {
        this.tooltip.replaceChildren(...lines.map(({ text, color, big }) => {
            const line = document.createElement('div')
            line.textContent = text
            if (color) line.style.color = color
            if (big) line.className = 'mc-tooltip-title'
            return line
        }))
        this.tooltip.hidden = false
        this.tooltipFor = anchor
        if (anchor) {
            const rect = anchor.getBoundingClientRect()
            this.placeTooltip(rect.right + 8, rect.top)
        } else if (event) this.moveTooltip(event)
    }

    moveTooltip(event) {
        if (this.tooltip.hidden || this.tooltipFor) return
        this.placeTooltip(event.clientX + 16, event.clientY - 10)
    }

    placeTooltip(x, y) {
        const width = this.tooltip.offsetWidth
        const height = this.tooltip.offsetHeight
        const left = Math.min(x, window.innerWidth - width - 8)
        const top = Math.max(8, Math.min(y, window.innerHeight - height - 8))
        this.tooltip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    }

    hideTooltip() {
        this.tooltip.hidden = true
        this.tooltipFor = null
    }
}
