import { Game } from '../Game.js'
import { MAX_PLAYERS } from '../utils/players.js'
import { waveHeight } from '../World/Waves.js'
import { EMOTES } from './emoteList.js'
import { iceServers, hasRelay } from './iceServers.js'

// Multiplayer rooms, browser to browser (WebRTC through PeerJS: no server of
// our own). One player is the host: the others connect to it and it relays
// everything (star). The room code is part of the host's PeerJS id, so
// joining is just connecting to PREFIX + code.
//
// The room lives while anyone is in it: when the host leaves (or its
// connection dies), the player with the lowest slot takes the room's id and
// the others reconnect to it, keeping their slots (host migration).
//
// Messages (JSON, one reliable ordered channel per guest):
//   guest → host  { k: 'hi', v, name, slot? }   on connect (slot: the one I had, after a migration)
//   host → guest  { k: 'welcome', slot, host, players, berth, day } | { k: 'full' } | { k: 'old' }
//   host → all    { k: 'join', slot, name } · { k: 'leave', slot } · { k: 'host-left' }
//   anyone        { k: 's', t, b, p, q, c, l, a, d }  state, 12 per second (d: the host's time of day)
//                 { k: 'c', text } chat · { k: 'e', e } emote · { k: 'n', name } new name
// The host stamps `from` (the sender's slot) on what it relays: a guest can
// never speak for someone else. Everything received is validated.
//
// status: 'offline' | 'connecting' | 'hosting' | 'joined'
// Events: 'net:status', 'net:players', 'net:error', 'chat:message', 'emote'
const PREFIX = 'portafolio-bote-sala-'
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 5
const PROTOCOL = 2
const SEND_INTERVAL = 1000 / 12
// Without news from someone for this long (ms), they're gone
const TIMEOUT = 10000
const CONNECT_TIMEOUT = 12000
// Host migration: how long to keep trying to take over / reconnect (ms)
const MIGRATION_TIME = 60000
const RETRY_EVERY = 1500
export const MAX_TEXT = 140
const MAX_NAME = 16
// Chat flood guard: messages per window (ms), per player
const CHAT_BURST = 5
const CHAT_WINDOW = 4000

const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value))
const round = (value, digits = 100) => Math.round(value * digits) / digits
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const cleanName = (name) => String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME)
export const cleanText = (text) => String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_TEXT)
export const cleanCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)

const randomCode = () => {
    const values = crypto.getRandomValues(new Uint32Array(CODE_LENGTH))
    return Array.from(values, (value) => CODE_CHARS[value % CODE_CHARS.length]).join('')
}

const validSlot = (slot) => Number.isInteger(slot) && slot >= 0 && slot < MAX_PLAYERS

// A state message from someone else, checked and clamped (or null)
function validState(message) {
    const { t, b, p, q, c } = message
    if (!finite(t) || typeof b !== 'string' || b.length > 40) return null
    if (!Array.isArray(p) || p.length !== 3 || !p.every(finite)) return null
    if (!Array.isArray(q) || q.length !== 4 || !q.every(finite)) return null
    let character = null
    if (Array.isArray(c) && c.length === 7 && (c[0] === 'd' || c[0] === 's') && [1, 2, 3, 4, 6].every((i) => finite(c[i])) && typeof c[5] === 'string') {
        character = [c[0], clamp(c[1], 2000), clamp(c[2], 50), clamp(c[3], 2000), c[4], c[5].slice(0, 8), clamp(c[6], 20)]
    }
    return {
        t,
        b,
        p: [clamp(p[0], 2000), clamp(p[1], 20), clamp(p[2], 2000)],
        q: q.map((value) => clamp(value, 1)),
        c: character,
        l: message.l === 1 ? 1 : 0,
        // Clothes: [skin, hat] ids ('' = no hat)
        a: Array.isArray(message.a) && message.a.length === 2 && message.a.every((id) => typeof id === 'string' && id.length <= 24) ? message.a : null,
        d: finite(message.d) ? ((message.d % 1) + 1) % 1 : null
    }
}

export class Network {
    constructor() {
        this.game = Game.getInstance()
        this.status = 'offline'
        this.code = null
        this.slot = 0
        this.hostSlot = 0
        // slot → { slot, name, connection (host side), seen, chat: [times] }
        this.players = new Map()
        this.peer = null
        this.hostConnection = null
        this.loop = null
        this.migrating = false

        // A shared link (?sala=CODE) joins that room right after setting sail
        const linked = cleanCode(new URLSearchParams(location.search).get('sala'))
        if (linked.length === CODE_LENGTH) this.game.events.on('start', () => this.join(linked))
        // Closing the tab: say goodbye so the others don't wait for the timeout.
        // Not 'pagehide': phones fire it when switching apps (to send the code
        // by WhatsApp…) and that closed the room.
        window.addEventListener('beforeunload', () => this.leave({ quiet: true }))
        // Back from the background: the phone may have cut the link to the server
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible' || !this.peer || this.peer.destroyed) return
            if (this.peer.disconnected) this.peer.reconnect()
        })
    }

    get online() {
        return this.status === 'hosting' || this.status === 'joined'
    }

    get hosting() {
        return this.status === 'hosting'
    }

    // The player's name, or a sailor number until they pick one
    get name() {
        const saved = cleanName(this.game.settings.get('playerName'))
        if (saved) return saved
        if (!this.defaultName) this.defaultName = `Marinero ${Math.floor(10 + Math.random() * 90)}`
        return this.defaultName
    }

    get link() {
        if (!this.code) return ''
        const url = new URL(location.href)
        url.hash = ''
        url.search = ''
        url.searchParams.set('sala', this.code)
        return url.toString()
    }

    nameOf(slot) {
        if (slot === this.slot) return this.name
        return this.players.get(slot)?.name ?? `Jugador ${slot + 1}`
    }

    setStatus(status) {
        this.status = status
        this.game.events.trigger('net:status', status)
    }

    system(text) {
        this.game.events.trigger('chat:message', { slot: -1, name: '', text, system: true })
    }

    playersChanged() {
        this.game.events.trigger('net:players', this.playerList())
    }

    // Everyone in the room, me included, by slot
    playerList() {
        if (!this.online) return []
        const list = [{ slot: this.slot, name: this.name, me: true, host: this.slot === this.hostSlot }]
        for (const player of this.players.values()) list.push({ slot: player.slot, name: player.name, me: false, host: player.slot === this.hostSlot })
        return list.sort((a, b) => a.slot - b.slot)
    }

    // PeerJS is only downloaded when a room is created or joined
    async createPeer(id) {
        const [{ Peer }, servers] = await Promise.all([import('peerjs'), iceServers()])
        // Our STUN/TURN list (PeerJS's default TURN servers no longer exist)
        const options = { debug: 0, config: { iceServers: servers } }
        return new Promise((resolve, reject) => {
            const peer = id ? new Peer(id, options) : new Peer(options)
            const timeout = setTimeout(() => {
                peer.destroy()
                reject(Object.assign(new Error('timeout'), { type: 'network' }))
            }, CONNECT_TIMEOUT)
            peer.once('open', () => {
                clearTimeout(timeout)
                peer.off('error')
                resolve(peer)
            })
            peer.once('error', (error) => {
                clearTimeout(timeout)
                peer.destroy()
                reject(error)
            })
        })
    }

    fail(message) {
        this.cleanup()
        this.setStatus('offline')
        this.system(message)
        this.game.events.trigger('net:error', message)
    }

    // ── Hosting ───────────────────────────────────────────────────────────

    async host() {
        if (this.status !== 'offline') return
        this.setStatus('connecting')
        try {
            // A code someone else is using: try another one
            for (let attempt = 0; attempt < 5 && !this.peer; attempt++) {
                const code = randomCode()
                try {
                    this.peer = await this.createPeer(PREFIX + code)
                    this.code = code
                } catch (error) {
                    if (error.type !== 'unavailable-id') throw error
                }
            }
            if (!this.peer) throw new Error('no code')
        } catch (error) {
            this.fail(this.describe(error))
            return
        }
        if (this.status !== 'connecting') {
            // Cancelled while connecting
            this.cleanup()
            return
        }
        this.slot = 0
        this.players.clear()
        this.game.settings.set('lastRoom', this.code)
        this.becomeHost()
        this.system(`Sala creada: ${this.code}. Comparte el código o el enlace (hasta ${MAX_PLAYERS} jugadores)`)
    }

    // This peer owns the room's id now: listen for players
    becomeHost() {
        this.hostSlot = this.slot
        this.hostConnection = null
        this.migrating = false
        this.peer.on('connection', (connection) => this.accept(connection))
        this.peer.on('disconnected', () => {
            // Lost the signaling server: the room keeps working, new people need it back
            if (this.hosting && !this.peer?.destroyed) this.peer.reconnect()
        })
        this.peer.on('error', (error) => {
            if (this.hosting && error.type !== 'peer-unavailable') console.warn('Sala:', error)
        })
        // Players known from before a migration get time to reconnect
        const now = performance.now()
        for (const player of this.players.values()) player.seen = now
        this.setStatus('hosting')
        this.playersChanged()
        this.startLoop()
    }

    // A berth with no boat in it (preferring the player's own slot)
    freeBerth(slot) {
        const { world, boat } = this.game
        const boats = [boat.mesh.position, ...this.game.remotePlayers.boatPositions()]
        const free = (index) => {
            const berth = world.berths[index]
            if (!berth) return false
            // The boat sits ~6 m ahead of the berth's stern line
            const x = berth.x + Math.sin(berth.angle) * 6
            const z = berth.z + Math.cos(berth.angle) * 6
            return boats.every((position) => Math.hypot(position.x - x, position.z - z) > 4.5)
        }
        if (free(slot)) return slot
        for (let index = 0; index < world.berths.length; index++) if (free(index)) return index
        return slot
    }

    accept(connection) {
        let slot = null
        const close = () => setTimeout(() => connection.close(), 400)
        connection.on('data', (message) => {
            if (!message || typeof message !== 'object' || typeof message.k !== 'string') return
            if (slot === null) {
                if (message.k !== 'hi') return
                if (message.v !== PROTOCOL) {
                    connection.send({ k: 'old' })
                    close()
                    return
                }
                // Back after a migration: same slot if it's still theirs (or free)
                const wanted = message.slot
                const rejoin = validSlot(wanted) && wanted !== this.slot && !this.players.get(wanted)?.connection
                const free = rejoin ? wanted : [0, 1, 2, 3, 4].find((candidate) => candidate < MAX_PLAYERS && candidate !== this.slot && !this.players.has(candidate))
                if (free === undefined) {
                    connection.send({ k: 'full' })
                    close()
                    return
                }
                slot = free
                const name = cleanName(message.name) || `Jugador ${slot + 1}`
                const known = this.players.has(slot)
                this.players.set(slot, { slot, name, connection, seen: performance.now(), chat: [] })
                connection.send({
                    k: 'welcome',
                    slot,
                    host: this.slot,
                    players: this.playerList().map(({ slot, name }) => ({ slot, name })),
                    // New players go to an empty berth; a reconnecting one stays where it is
                    berth: rejoin ? null : this.freeBerth(slot),
                    day: this.game.world.dayCycle.params.time
                })
                if (!known) {
                    this.broadcast({ k: 'join', slot, name }, slot)
                    this.game.remotePlayers.add(slot, name)
                    this.system(`${name} se unió a la sala`)
                }
                this.playersChanged()
                return
            }
            this.fromGuest(slot, message)
        })
        const drop = () => slot !== null && this.players.get(slot)?.connection === connection && this.dropGuest(slot)
        connection.on('close', drop)
        connection.on('error', drop)
    }

    fromGuest(slot, message) {
        const player = this.players.get(slot)
        if (!player) return
        player.seen = performance.now()
        if (message.k === 'bye') {
            this.dropGuest(slot)
            return
        }
        if (message.k === 's') {
            const state = validState(message)
            if (!state) return
            // Only the host sets the time of day
            state.d = null
            this.game.remotePlayers.push(slot, state)
            this.broadcast({ ...state, k: 's', from: slot }, slot)
        } else if (message.k === 'c') {
            const text = cleanText(message.text)
            if (!text || !this.allowChat(player)) return
            this.showChat(slot, text)
            this.broadcast({ k: 'c', from: slot, text }, slot)
        } else if (message.k === 'e') {
            if (!Number.isInteger(message.e) || !EMOTES[message.e]) return
            this.game.events.trigger('emote', { slot, index: message.e })
            this.broadcast({ k: 'e', from: slot, e: message.e }, slot)
        } else if (message.k === 'n') {
            const name = cleanName(message.name)
            if (!name || name === player.name) return
            this.rename(slot, name)
            this.broadcast({ k: 'n', from: slot, name }, slot)
        }
    }

    allowChat(player) {
        const now = performance.now()
        player.chat = player.chat.filter((time) => now - time < CHAT_WINDOW)
        if (player.chat.length >= CHAT_BURST) return false
        player.chat.push(now)
        return true
    }

    dropGuest(slot) {
        const player = this.players.get(slot)
        if (!player) return
        this.players.delete(slot)
        try {
            player.connection?.close()
        } catch {
            // Already closed
        }
        this.broadcast({ k: 'leave', slot })
        this.game.remotePlayers.remove(slot)
        this.system(`${player.name} salió de la sala`)
        this.playersChanged()
    }

    // Host: to every guest (but one)
    broadcast(message, except = null) {
        for (const player of this.players.values()) {
            if (player.slot === except || !player.connection?.open) continue
            try {
                player.connection.send(message)
            } catch {
                // A closing channel: its close event will drop the guest
            }
        }
    }

    // ── Joining ───────────────────────────────────────────────────────────

    async join(rawCode) {
        const code = cleanCode(rawCode)
        if (code.length !== CODE_LENGTH) {
            this.game.events.trigger('net:error', `El código tiene ${CODE_LENGTH} letras o números`)
            return
        }
        if (this.status !== 'offline') {
            if (this.code === code) return
            this.leave({ quiet: true })
        }
        this.setStatus('connecting')
        this.code = code
        try {
            this.peer = await this.createPeer()
        } catch (error) {
            this.fail(this.describe(error))
            return
        }
        if (this.status !== 'connecting') {
            this.cleanup()
            return
        }
        const connected = await this.connect()
        if (connected === 'unavailable' && this.status === 'connecting') this.fail(`No se encontró la sala ${code}: revisa el código, y que quien la creó siga con el juego abierto`)
        else if (!connected && this.status === 'connecting') {
            // The room exists but the two devices couldn't reach each other: usually different networks without a relay
            this.fail(hasRelay()
                ? 'No se pudo conectar con la sala. Inténtalo otra vez'
                : 'No se pudo conectar. Si uno está con datos móviles, conéctense a la misma WiFi (falta configurar un servidor TURN)')
        }
    }

    // Opens the channel to the room's host and waits for its welcome.
    // Resolves true, false (no answer) or 'unavailable' (nobody has that id).
    connect(slot = null) {
        return new Promise((resolve) => {
            const peer = this.peer
            if (!peer || peer.destroyed) return resolve(false)
            let done = false
            const finish = (result) => {
                if (done) return
                done = true
                clearTimeout(timeout)
                peer.off('error', onError)
                resolve(result)
            }
            const onError = (error) => finish(error.type === 'peer-unavailable' ? 'unavailable' : false)
            const timeout = setTimeout(() => finish(false), CONNECT_TIMEOUT)
            peer.on('error', onError)

            const connection = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' })
            connection.on('open', () => connection.send({ k: 'hi', v: PROTOCOL, name: this.name, slot }))
            connection.on('data', (message) => {
                if (message?.k === 'welcome') {
                    this.hostConnection = connection
                    finish(true)
                }
                if (this.hostConnection === connection || message?.k === 'welcome' || message?.k === 'full' || message?.k === 'old') this.fromHost(message)
            })
            connection.on('close', () => {
                if (this.hostConnection === connection) this.hostLost()
                else finish(false)
            })
        })
    }

    fromHost(message) {
        if (!message || typeof message !== 'object') return
        this.hostSeen = performance.now()
        const from = message.from ?? this.hostSlot
        switch (message.k) {
            case 'welcome':
                this.welcome(message)
                return
            case 'full':
                this.fail(`La sala ${this.code} está llena (${MAX_PLAYERS} de ${MAX_PLAYERS})`)
                return
            case 'old':
                this.fail('La sala usa otra versión del juego. Recarguen la página')
                return
            case 'host-left':
                this.hostLost()
                return
        }
        if (this.status !== 'joined' || this.migrating) return
        if (message.k === 'join') {
            if (!validSlot(message.slot) || message.slot === this.slot) return
            const name = cleanName(message.name) || `Jugador ${message.slot + 1}`
            this.players.set(message.slot, { slot: message.slot, name })
            this.game.remotePlayers.add(message.slot, name)
            this.system(`${name} se unió a la sala`)
            this.playersChanged()
            return
        }
        if (message.k === 'leave') {
            const player = this.players.get(message.slot)
            if (!player) return
            this.players.delete(message.slot)
            this.game.remotePlayers.remove(message.slot)
            this.system(`${player.name} salió de la sala`)
            this.playersChanged()
            return
        }
        // Relayed from someone in the room
        if (!validSlot(from) || from === this.slot || !this.players.has(from)) return
        if (message.k === 's') {
            const state = validState(message)
            if (!state) return
            this.game.remotePlayers.push(from, state)
            // Everyone shares the host's time of day
            if (from === this.hostSlot && state.d !== null) this.syncDay(state.d)
        } else if (message.k === 'c') {
            const text = cleanText(message.text)
            if (text) this.showChat(from, text)
        } else if (message.k === 'e') {
            if (Number.isInteger(message.e) && EMOTES[message.e]) this.game.events.trigger('emote', { slot: from, index: message.e })
        } else if (message.k === 'n') {
            const name = cleanName(message.name)
            if (name) this.rename(from, name)
        }
    }

    welcome(message) {
        if (!validSlot(message.slot) || !validSlot(message.host) || !Array.isArray(message.players)) return
        const rejoining = this.migrating
        this.slot = message.slot
        this.hostSlot = message.host
        // The room as the host sees it: add who's new, remove who's gone
        const listed = new Set()
        for (const entry of message.players) {
            if (!validSlot(entry?.slot) || entry.slot === this.slot) continue
            listed.add(entry.slot)
            const name = cleanName(entry.name) || `Jugador ${entry.slot + 1}`
            this.players.set(entry.slot, { slot: entry.slot, name })
            this.game.remotePlayers.add(entry.slot, name)
        }
        for (const slot of [...this.players.keys()]) {
            if (listed.has(slot)) continue
            this.players.delete(slot)
            this.game.remotePlayers.remove(slot)
        }
        if (finite(message.day)) this.syncDay(message.day, true)
        // New in the room: to an empty berth at the marina
        if (Number.isInteger(message.berth) && message.berth >= 0) this.game.boat.setBerth(message.berth)
        this.migrating = false
        this.setStatus('joined')
        if (rejoining) this.system(`La sala sigue: ahora la mantiene ${this.nameOf(this.hostSlot)}`)
        else this.system(`Te uniste a la sala ${this.code}`)
        this.game.settings.set('lastRoom', this.code)
        this.playersChanged()
        this.startLoop()
    }

    // The host's clock of the day; small differences are corrected gently
    syncDay(time, snap = false) {
        const params = this.game.world.dayCycle.params
        let difference = time - params.time
        difference -= Math.round(difference)
        if (snap || Math.abs(difference) > 0.01) params.time = ((time % 1) + 1) % 1
        else params.time = (((params.time + difference * 0.1) % 1) + 1) % 1
    }

    // ── Host migration ────────────────────────────────────────────────────

    // The host left or its connection died: the lowest slot left takes over
    // the room's id, the others reconnect to it
    async hostLost() {
        if (this.status !== 'joined' || this.migrating) return
        this.migrating = true
        const old = this.players.get(this.hostSlot)
        this.players.delete(this.hostSlot)
        this.game.remotePlayers.remove(this.hostSlot)
        this.hostConnection = null
        const next = Math.min(this.slot, ...this.players.keys())
        this.system(`${old?.name ?? 'El anfitrión'} salió. La sala sigue…`)
        this.playersChanged()

        const deadline = performance.now() + MIGRATION_TIME
        if (next === this.slot) {
            // Me: take the room's id (it frees up a few seconds after the old host is gone)
            this.peer?.destroy()
            this.peer = null
            while (performance.now() < deadline && this.migrating && this.status === 'joined') {
                try {
                    this.peer = await this.createPeer(PREFIX + this.code)
                    break
                } catch (error) {
                    if (error.type !== 'unavailable-id' && error.type !== 'network' && error.type !== 'server-error' && error.type !== 'socket-error') break
                    await wait(RETRY_EVERY)
                }
            }
            if (!this.peer) {
                if (this.migrating) this.fail('Se perdió la sala')
                return
            }
            this.becomeHost()
            this.system('Ahora tú mantienes la sala')
            return
        }
        // Someone else: reconnect to the room until they're there
        await wait(RETRY_EVERY)
        while (performance.now() < deadline && this.migrating && this.status === 'joined') {
            if (await this.connect(this.slot) === true) return
            await wait(RETRY_EVERY)
        }
        if (this.migrating) this.fail('Se perdió la sala')
    }

    // ── Sending ───────────────────────────────────────────────────────────

    send(message) {
        if (this.hosting) {
            this.broadcast({ ...message, from: this.slot })
            return
        }
        if (this.status === 'joined' && !this.migrating && this.hostConnection?.open) {
            try {
                this.hostConnection.send(message)
            } catch {
                // The close event handles a dead channel
            }
        }
    }

    // Chat: shown right away, sent if in a room
    say(text) {
        const clean = cleanText(text)
        if (!clean) return
        const now = performance.now()
        this.sent = (this.sent ?? []).filter((time) => now - time < CHAT_WINDOW)
        if (this.sent.length >= CHAT_BURST) {
            this.system('Más despacio: espera un momento para escribir otra vez')
            return
        }
        this.sent.push(now)
        this.showChat(this.slot, clean)
        if (this.online) this.send({ k: 'c', text: clean })
        else if (!this.toldAlone) {
            this.toldAlone = true
            this.system('Estás navegando solo. Crea o únete a una sala en ⚙ Pausa → Multijugador')
        }
    }

    emote(index) {
        if (!EMOTES[index]) return
        this.game.events.trigger('emote', { slot: this.slot, index, me: true })
        if (this.online) this.send({ k: 'e', e: index })
    }

    setName(name) {
        const clean = cleanName(name)
        this.game.settings.set('playerName', clean)
        if (this.online) {
            this.send({ k: 'n', name: this.name })
            this.playersChanged()
        }
    }

    showChat(slot, text) {
        this.game.events.trigger('chat:message', { slot, name: this.nameOf(slot), text, system: false })
    }

    rename(slot, name) {
        const player = this.players.get(slot)
        if (!player) return
        const before = player.name
        player.name = name
        this.game.remotePlayers.setName(slot, name)
        this.system(`${before} ahora se llama ${name}`)
        this.playersChanged()
    }

    // States go out on a timer (not the frame loop) so a background tab keeps
    // sending, and the others don't think it left
    startLoop() {
        clearInterval(this.loop)
        this.hostSeen = performance.now()
        this.loop = setInterval(() => this.tick(), SEND_INTERVAL)
    }

    tick() {
        if (!this.online || this.migrating) return
        const now = performance.now()
        const { boat, character, ticker, inventory } = this.game
        const p = boat.mesh.position
        const q = boat.mesh.quaternion
        this.send({
            k: 's',
            t: Math.round(now),
            b: boat.definition.id,
            // Height relative to the waves: everyone's waves run on their own clock
            p: [round(p.x), round(p.y - waveHeight(p.x, p.z, ticker.elapsed), 1000), round(p.z)],
            q: [round(q.x, 1000), round(q.y, 1000), round(q.z, 1000), round(q.w, 1000)],
            c: character.netState(),
            l: character.lightsOn && character.deck ? 1 : 0,
            a: [inventory.skin, inventory.hat ?? ''],
            // The host's time of day, for everyone
            ...(this.hosting ? { d: round(this.game.world.dayCycle.params.time, 10000) } : {})
        })

        // Silent for too long: gone
        if (this.hosting) {
            for (const player of [...this.players.values()]) if (now - player.seen > TIMEOUT) this.dropGuest(player.slot)
        } else if (now - this.hostSeen > TIMEOUT) {
            this.hostLost()
        }
    }

    // ── Leaving ───────────────────────────────────────────────────────────

    leave({ quiet = false } = {}) {
        if (this.status === 'offline') return
        const wasOnline = this.online
        // The room stays with the others: they take over
        if (this.hosting) this.broadcast({ k: 'host-left' })
        else if (this.status === 'joined') this.send({ k: 'bye' })
        this.cleanup()
        this.setStatus('offline')
        if (!quiet && wasOnline) this.system('Saliste de la sala')
    }

    cleanup() {
        clearInterval(this.loop)
        this.loop = null
        this.migrating = false
        const peer = this.peer
        this.peer = null
        this.hostConnection = null
        // Let the goodbye message go out before closing
        if (peer) setTimeout(() => peer.destroy(), 150)
        this.players.clear()
        this.game.remotePlayers.clear()
        this.code = null
        // Alone again: berth 0 for the next respawn, without moving the boat now
        this.slot = 0
        this.hostSlot = 0
        this.game.boat.setBerth(0, { move: false })
        this.playersChanged()
    }

    describe(error) {
        if (error?.type === 'browser-incompatible') return 'Tu navegador no permite salas multijugador'
        if (error?.type === 'network' || error?.type === 'server-error' || error?.type === 'socket-error') return 'No hay conexión con el servidor de salas. Revisa tu internet'
        return 'No se pudo conectar. Inténtalo otra vez'
    }
}
