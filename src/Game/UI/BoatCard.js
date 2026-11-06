import { Game } from '../Game.js'
import { keyLabel } from '../utils/keys.js'

// Card shown in a showroom zone: the boat's specs and a button (or Enter)
// to switch to it. The choice is saved in the settings, so it's remembered.
export class BoatCard {
    constructor() {
        this.game = Game.getInstance()
        this.element = document.getElementById('boat-card')
        this.name = document.getElementById('boat-name')
        this.description = document.getElementById('boat-description')
        this.stats = document.getElementById('boat-stats')
        this.button = document.getElementById('boat-use')
        this.current = null

        const boatOf = (zone) => (zone?.type === 'boat' ? zone : null)
        this.game.events.on('zone:change', (active) => {
            if (this.game.state.started) this.show(boatOf(active))
        })
        this.game.events.on('start', () => this.show(boatOf(this.game.world.zones.active)))
        this.game.events.on('interact', (zone) => zone?.type === 'boat' && this.select())
        // Refresh the button after switching
        this.game.events.on('settings:change', (key) => (key === 'boat' || key === 'bindings') && this.render())
        this.button.addEventListener('click', () => this.select())
    }

    show(zone) {
        if (zone === this.current) return
        this.current = zone
        if (!zone) {
            this.element.classList.remove('visible')
            return
        }
        this.render()
        this.element.classList.add('visible')
    }

    render() {
        if (!this.current) return
        const { definition } = this.current
        const { physics } = definition
        this.name.textContent = definition.name
        this.description.textContent = definition.description
        this.element.style.borderColor = definition.colors.stripe

        // Top speed ≈ thrust / drag (m/s), shown in km/h
        const speed = (physics.power / physics.forwardDrag) * 3.6
        const boost = (physics.boostPower / physics.forwardDrag) * 3.6
        const rows = [
            ['Velocidad', speed / 80, `${Math.round(speed)} km/h`],
            ['Turbo', boost / 110, `${Math.round(boost)} km/h`],
            ['Giro', physics.turn / 2.5, ''],
            ['Estabilidad', (physics.mass * physics.verticalDamping) / 25, '']
        ]
        this.stats.replaceChildren(...rows.flatMap(([label, ratio, value]) => {
            const name = document.createElement('span')
            name.textContent = label
            const bar = document.createElement('div')
            bar.className = 'bar'
            const fill = document.createElement('i')
            fill.style.width = `${Math.round(Math.min(1, Math.max(0.05, ratio)) * 100)}%`
            bar.appendChild(fill)
            const text = document.createElement('span')
            text.className = 'value'
            text.textContent = value
            return [name, bar, text]
        }))

        const inUse = this.game.boat.definition.id === definition.id
        this.button.disabled = inUse
        const key = keyLabel(this.game.inputs.keysFor('open')[0])
        // The key only on desktop: touch screens just tap the button
        if (inUse) this.button.textContent = '✓ Es tu bote actual'
        else {
            const hint = document.createElement('span')
            hint.className = 'desktop-only'
            hint.textContent = ` (${key})`
            this.button.replaceChildren('Usar este bote', hint)
        }
    }

    select() {
        if (!this.current || this.game.boat.definition.id === this.current.id) return
        this.game.settings.set('boat', this.current.id)
    }
}
