import { Game } from '../Game.js'
import { MAX_PLAYERS, playerColor } from '../utils/players.js'
import { cleanCode } from '../Network/Network.js'

// "Multijugador" page of the pause menu: your name, create a room (and share
// its code or link) or join one with a code. Also the room badge in the HUD.
export class RoomPanel {
    constructor() {
        this.game = Game.getInstance()
        const $ = (id) => document.getElementById(id)
        this.pauseCard = document.querySelector('#pause .pause-card')
        this.card = $('room-card')
        this.nameInput = $('room-name')
        this.codeInput = $('room-code')
        this.offline = $('room-offline')
        this.online = $('room-online')
        this.codeValue = $('room-code-value')
        this.playerList = $('room-players')
        this.message = $('room-message')
        this.createButton = $('room-create')
        this.joinButton = $('room-join')
        this.badge = $('room-badge')
        const network = this.game.network

        $('room-button').addEventListener('click', () => this.open())
        $('room-back').addEventListener('click', () => this.close())
        this.createButton.addEventListener('click', () => {
            this.saveName()
            network.host()
        })
        const join = () => {
            this.saveName()
            network.join(this.codeInput.value)
        }
        this.joinButton.addEventListener('click', join)
        this.codeInput.addEventListener('input', () => (this.codeInput.value = cleanCode(this.codeInput.value)))
        this.codeInput.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'NumpadEnter') join()
        })
        this.nameInput.addEventListener('change', () => this.saveName())
        this.nameInput.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'NumpadEnter') this.nameInput.blur()
        })
        $('room-leave').addEventListener('click', () => network.leave())
        $('room-copy-code').addEventListener('click', () => this.copy(network.code, 'Código copiado'))
        $('room-copy-link').addEventListener('click', () => this.copy(network.link, 'Enlace copiado: compártelo y entrarán directo a tu sala'))

        // Esc on this page goes back to the pause menu instead of resuming the game
        window.addEventListener('keydown', (event) => {
            if (!this.isOpen || event.code !== 'Escape') return
            event.preventDefault()
            event.stopImmediatePropagation()
            this.close()
        }, { capture: true })

        const { events } = this.game
        events.on('pause', (paused) => !paused && this.close(false))
        events.on('net:status', () => this.render())
        events.on('net:players', () => this.render())
        events.on('net:error', (message) => this.say(message))
        this.render()
    }

    get isOpen() {
        return !this.card.hidden
    }

    open() {
        this.pauseCard.hidden = true
        this.card.hidden = false
        this.nameInput.value = this.game.settings.get('playerName') ?? ''
        this.nameInput.placeholder = this.game.network.name
        this.say('')
        this.render()
        ;(this.game.network.online ? document.getElementById('room-copy-code') : this.createButton).focus()
    }

    close(focus = true) {
        if (!this.isOpen) return
        this.saveName()
        this.card.hidden = true
        this.pauseCard.hidden = false
        if (focus) document.getElementById('room-button').focus()
    }

    saveName() {
        const value = this.nameInput.value
        if (value.trim() !== (this.game.settings.get('playerName') ?? '')) this.game.network.setName(value)
    }

    async copy(text, done) {
        if (!text) return
        try {
            await navigator.clipboard.writeText(text)
            this.say(done)
        } catch {
            // No clipboard (http, old browser): show it to copy by hand
            this.say(text)
        }
    }

    say(text) {
        this.message.textContent = text
    }

    render() {
        const network = this.game.network
        const status = network.status
        const online = network.online
        this.offline.hidden = online
        this.online.hidden = !online
        this.createButton.disabled = this.joinButton.disabled = status === 'connecting'
        if (status === 'connecting') this.say('Conectando…')
        else if (this.message.textContent === 'Conectando…') this.say('')

        const players = network.playerList()
        if (online) {
            this.codeValue.textContent = network.code
            this.playerList.replaceChildren(...players.map(({ slot, name, me }) => {
                const item = document.createElement('li')
                const dot = document.createElement('i')
                dot.style.background = playerColor(slot)
                item.append(dot, `${name}${me ? ' (tú)' : ''}${slot === 0 ? ' · anfitrión' : ''}`)
                return item
            }))
        }

        // HUD badge
        this.badge.hidden = !online && status !== 'connecting'
        this.badge.textContent = online ? `👥 Sala ${network.code} · ${players.length}/${MAX_PLAYERS}` : '👥 Conectando…'
    }
}
