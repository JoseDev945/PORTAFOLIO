import { Game } from '../Game.js'
import { keyLabel } from '../utils/keys.js'

// Fills every [data-hints] element with the player's current keys, so the
// on-screen help never shows a key that was changed in the menu.
//   data-hints="hud" | "start" | "pause"   → full lines of help
//   data-hints="<action>"                  → just that action's first key
export class KeyHints {
    constructor() {
        this.game = Game.getInstance()
        this.render()
        this.game.events.on('settings:change', (key) => key === 'bindings' && this.render())
    }

    key(action) {
        return keyLabel(this.game.inputs.keysFor(action)[0])
    }

    kbd(action) {
        const element = document.createElement('kbd')
        element.textContent = this.key(action)
        return element
    }

    // A line made of text and <kbd> elements: ['text', { kbd: 'map' }, …]
    line(parts) {
        const span = document.createElement('span')
        for (const part of parts) span.append(typeof part === 'string' ? part : this.kbd(part.kbd))
        return span
    }

    render() {
        const k = (action) => this.key(action)
        for (const element of document.querySelectorAll('[data-hints]')) {
            const type = element.dataset.hints
            if (type === 'hud') {
                element.textContent = `${k('forward')}${k('left')}${k('backward')}${k('right')} navegar · ${k('boost')} turbo · ${k('character')} usar · ${k('camera')} cámara · ${k('map')} mapa · Enter chat · ${k('emote')} emotes · Esc pausa`
            } else if (type === 'start') {
                element.replaceChildren(
                    this.line([{ kbd: 'forward' }, { kbd: 'left' }, { kbd: 'backward' }, { kbd: 'right' }, ' — navegar']),
                    this.line([{ kbd: 'boost' }, ' — turbo']),
                    this.line([{ kbd: 'respawn' }, ' — reaparecer · ', { kbd: 'map' }, ' — mapa · ', { kbd: 'pause' }, ' — pausa']),
                    this.line([{ kbd: 'character' }, ' — usar: abrir proyecto, bajarte al muelle y caminar · ', { kbd: 'camera' }, ' — cámara']),
                    this.line([{ kbd: 'chat' }, ' — chat · ', { kbd: 'emote' }, ' — emotes sobre tu bote']),
                    this.line(['Clic derecho — pescar (Corvina 250) · ', { kbd: 'inventory' }, ' — inventario']),
                    this.line(['Puedes cambiar las teclas en Pausa → Controles'])
                )
            } else if (type === 'pause') {
                element.replaceChildren(
                    this.line([{ kbd: 'pause' }, ' pausa']),
                    this.line([{ kbd: 'map' }, ' mapa']),
                    this.line([{ kbd: 'respawn' }, ' reaparecer']),
                    this.line([{ kbd: 'camera' }, ' cámara']),
                    this.line([{ kbd: 'chat' }, ' chat · ', { kbd: 'emote' }, ' emotes'])
                )
            } else {
                element.textContent = k(type)
            }
        }
    }
}
