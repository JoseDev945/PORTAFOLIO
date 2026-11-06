import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { TickOrder } from '../Ticker.js'
import { isTouch } from '../Inputs.js'
import { keyLabel } from '../utils/keys.js'

const _position = new THREE.Vector3()

// Desktop, first person: "F Tomar caña" floating next to what the crosshair
// is on (see Character.aimedTarget). Touch screens use the prompt on top.
export class AimLabel {
    constructor() {
        this.game = Game.getInstance()
        this.element = document.createElement('div')
        this.element.className = 'aim-label'
        this.element.setAttribute('aria-live', 'polite')
        document.body.appendChild(this.element)
        this.key = ''
        this.game.events.on('settings:change', (key) => key === 'bindings' && (this.key = ''))
        this.game.ticker.on(() => this.update(), TickOrder.UI + 1)
    }

    update() {
        const target = isTouch() ? null : this.game.character.aimedTarget()
        this.element.classList.toggle('visible', Boolean(target))
        if (!target) return

        // Text only changes when the target or its labels do
        const key = target.prompt.map(({ action, label }) => `${action}:${label}`).join('|')
        if (key !== this.key) {
            this.key = key
            this.element.replaceChildren(...target.prompt.map(({ action, label }) => {
                const line = document.createElement('div')
                const kbd = document.createElement('kbd')
                kbd.textContent = keyLabel(this.game.inputs.keysFor(action)[0])
                line.append(kbd, ` ${label}`)
                return line
            }))
        }

        // Right of the object on screen
        target.object.getWorldPosition(_position).project(this.game.view.camera)
        const x = (_position.x * 0.5 + 0.5) * window.innerWidth + 36
        const y = (-_position.y * 0.5 + 0.5) * window.innerHeight
        this.element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translateY(-50%)`
    }
}
