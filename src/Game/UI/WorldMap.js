import { Game } from '../Game.js'
import { TickOrder } from '../Ticker.js'

// Full world map (Tab). Drawn on a 2D canvas, oriented like the 3D camera so
// "up" on the map is the direction the camera looks at.
const WORLD_RADIUS = 170

export class WorldMap {
    constructor() {
        this.game = Game.getInstance()
        const cameraDirection = this.game.view.direction
        this.element = document.getElementById('map')
        this.canvas = document.getElementById('map-canvas')
        this.context = this.canvas.getContext('2d')
        this.visible = false
        // Only the ✕ (or the map key / 🗺) closes it: a stray tap on the map shouldn't
        document.getElementById('map-close').addEventListener('click', () => this.toggle(false))

        // Pick an island on the map, then "Ir a esta isla" teleports the boat next to it
        this.selected = null
        this.panel = document.getElementById('map-panel')
        this.panelName = document.getElementById('map-panel-name')
        this.canvas.addEventListener('click', (event) => this.pick(event))
        document.getElementById('map-teleport').addEventListener('click', () => this.teleport())

        // Horizontal camera axes, used to rotate world (x, z) into map (x, y)
        const length = Math.hypot(cameraDirection.x, cameraDirection.z)
        this.forward = { x: -cameraDirection.x / length, z: -cameraDirection.z / length }
        this.right = { x: -this.forward.z, z: this.forward.x }

        this.game.events.on('pause', (paused) => paused && this.toggle(false))
        this.game.ticker.on(() => {
            const active = this.game.world.zones.active
            this.draw(this.game.boat, active?.type === 'project' ? active.project : null, performance.now() / 1000)
        }, TickOrder.UI)
    }

    toggle(force = !this.visible) {
        if (force === this.visible) return
        this.visible = force
        // First person on PC: the locked mouse is freed to use the map, and
        // locked again when it closes (the key press counts as a gesture)
        const { view } = this.game
        if (force) {
            this.relock = view.locked
            view.unlock()
        } else if (this.relock && view.mode === 'first' && this.game.playing) {
            this.relock = false
            view.lock()
        }
        this.game.events.trigger('ui:click')
        this.element.classList.toggle('visible', force)
        this.select(null)
        if (force) this.resize()
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect()
        const ratio = Math.min(window.devicePixelRatio, 2)
        this.canvas.width = rect.width * ratio
        this.canvas.height = rect.height * ratio
        this.size = rect.width
        this.ratio = ratio
    }

    // Map point (CSS pixels on the canvas) back to world x, z
    unproject(mapX, mapY) {
        const scale = (this.size * 0.5) / WORLD_RADIUS
        const u = (mapX - this.size / 2) / scale
        const v = -(mapY - this.size / 2) / scale
        return { x: u * this.right.x + v * this.forward.x, z: u * this.right.z + v * this.forward.z }
    }

    pick(event) {
        const rect = this.canvas.getBoundingClientRect()
        const point = this.unproject(event.clientX - rect.left, event.clientY - rect.top)
        let best = null
        let bestDistance = Infinity
        for (const island of this.game.world.islands) {
            // Generous margin: islands are small on a phone
            const distance = Math.hypot(island.x - point.x, island.z - point.z) - island.radius
            if (distance < Math.max(8, island.radius * 0.6) && distance < bestDistance) {
                best = island
                bestDistance = distance
            }
        }
        this.select(best)
        this.game.events.trigger('ui:click')
    }

    select(island) {
        this.selected = island
        this.panel.hidden = !island
        if (island) this.panelName.textContent = island.project ? (island.project.label ?? island.project.title) : 'Islote'
    }

    // Next to the island, on its project ring (the dock side), facing the island
    teleport() {
        const island = this.selected
        if (!island) return
        let x
        let z
        if (island.zone) {
            const dx = island.zone.x - island.x
            const dz = island.zone.z - island.z
            const length = Math.hypot(dx, dz) || 1
            x = island.zone.x + (dx / length) * 4
            z = island.zone.z + (dz / length) * 4
        } else {
            // No ring: in open water on the side facing the center of the world
            const length = Math.hypot(island.x, island.z) || 1
            x = island.x - (island.x / length) * (island.radius + 12)
            z = island.z - (island.z / length) * (island.radius + 12)
        }
        this.game.boat.teleport(x, z, Math.atan2(island.x - x, island.z - z))
        this.toggle(false)
    }

    project(x, z) {
        const scale = (this.size * 0.5) / WORLD_RADIUS
        return {
            x: this.size / 2 + (x * this.right.x + z * this.right.z) * scale,
            y: this.size / 2 - (x * this.forward.x + z * this.forward.z) * scale
        }
    }

    draw(boat, activeProject, time) {
        if (!this.visible) return
        const context = this.context
        const size = this.size
        const scale = (size * 0.5) / WORLD_RADIUS
        context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0)
        context.clearRect(0, 0, size, size)

        // Sea
        context.fillStyle = '#1773b8'
        context.beginPath()
        context.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
        context.fill()
        context.strokeStyle = 'rgba(255, 255, 255, 0.35)'
        context.lineWidth = 2
        context.setLineDash([6, 8])
        context.stroke()
        context.setLineDash([])

        // Grid
        context.strokeStyle = 'rgba(255, 255, 255, 0.06)'
        context.lineWidth = 1
        for (let i = -WORLD_RADIUS; i <= WORLD_RADIUS; i += 40) {
            for (const [a, b] of [[this.project(i, -WORLD_RADIUS), this.project(i, WORLD_RADIUS)], [this.project(-WORLD_RADIUS, i), this.project(WORLD_RADIUS, i)]]) {
                context.beginPath()
                context.moveTo(a.x, a.y)
                context.lineTo(b.x, b.y)
                context.stroke()
            }
        }

        // Islands, zones and names
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        for (const island of this.game.world.islands) {
            const { project } = island
            const center = this.project(island.x, island.z)

            context.fillStyle = 'rgba(62, 230, 210, 0.35)'
            context.beginPath()
            context.arc(center.x, center.y, (island.radius + 5) * scale, 0, Math.PI * 2)
            context.fill()
            context.fillStyle = '#f1d39a'
            context.beginPath()
            context.arc(center.x, center.y, island.radius * scale, 0, Math.PI * 2)
            context.fill()
            context.fillStyle = '#5cb84a'
            context.beginPath()
            context.arc(center.x, center.y, island.radius * 0.7 * scale, 0, Math.PI * 2)
            context.fill()

            if (island === this.selected) {
                context.strokeStyle = '#ffb347'
                context.lineWidth = 3
                context.beginPath()
                context.arc(center.x, center.y, (island.radius + 8) * scale + 4, 0, Math.PI * 2)
                context.stroke()
            }

            // Islands without project are drawn without zone nor name
            if (!project) continue
            const accent = project.color
            const zone = this.project(island.zone.x, island.zone.z)
            const isActive = project === activeProject
            context.strokeStyle = isActive ? accent : 'rgba(255, 255, 255, 0.8)'
            context.lineWidth = isActive ? 3 : 1.5
            context.setLineDash([4, 4])
            context.beginPath()
            context.arc(zone.x, zone.y, island.zone.radius * scale, 0, Math.PI * 2)
            context.stroke()
            context.setLineDash([])

            const fontSize = Math.max(11, size * 0.026)
            context.font = `700 ${fontSize}px system-ui, sans-serif`
            const label = project.label ?? project.title
            const labelY = center.y - (island.radius + 4) * scale - fontSize * 0.6
            const width = context.measureText(label).width + 16
            context.fillStyle = 'rgba(8, 30, 60, 0.85)'
            context.beginPath()
            context.roundRect(center.x - width / 2, labelY - fontSize * 0.8, width, fontSize * 1.6, fontSize * 0.8)
            context.fill()
            context.fillStyle = accent
            context.fillText(label, center.x, labelY)
        }

        // The other players in the room: a dot in their color with their name
        for (const player of this.game.remotePlayers.list()) {
            const dot = this.project(player.x, player.z)
            context.fillStyle = player.color
            context.strokeStyle = '#08203c'
            context.lineWidth = 2
            context.beginPath()
            context.arc(dot.x, dot.y, 7, 0, Math.PI * 2)
            context.fill()
            context.stroke()
            context.font = `700 ${Math.max(10, size * 0.022)}px system-ui, sans-serif`
            context.fillStyle = '#ffffff'
            context.fillText(player.name, dot.x, dot.y - 15)
        }

        // You (the boat, or yourself on land): pulsing "you are here" marker + heading arrow
        const { character } = this.game
        const position = character.rig().position
        const point = this.project(position.x, position.z)
        // Keep the marker on the map edge when sailing beyond it
        const fromCenter = Math.hypot(point.x - size / 2, point.y - size / 2)
        const maxDistance = size / 2 - 14
        if (fromCenter > maxDistance) {
            point.x = size / 2 + ((point.x - size / 2) / fromCenter) * maxDistance
            point.y = size / 2 + ((point.y - size / 2) / fromCenter) * maxDistance
        }
        const pulse = (time * 0.8) % 1
        context.strokeStyle = `rgba(255, 179, 71, ${1 - pulse})`
        context.lineWidth = 2
        context.beginPath()
        context.arc(point.x, point.y, 8 + pulse * 22, 0, Math.PI * 2)
        context.stroke()

        // Boat forward (local +Z) projected on the map
        const q = boat.mesh.quaternion
        let fx = 2 * (q.x * q.z + q.w * q.y)
        let fz = 1 - 2 * (q.x * q.x + q.y * q.y)
        if (character.ashore) {
            fx = Math.sin(character.heading)
            fz = Math.cos(character.heading)
        }
        const heading = Math.atan2(-(fx * this.forward.x + fz * this.forward.z), fx * this.right.x + fz * this.right.z)

        context.save()
        context.translate(point.x, point.y)
        context.rotate(heading)
        context.fillStyle = '#ffb347'
        context.strokeStyle = '#3a1d00'
        context.lineWidth = 2
        context.beginPath()
        context.moveTo(12, 0)
        context.lineTo(-8, 8)
        context.lineTo(-4, 0)
        context.lineTo(-8, -8)
        context.closePath()
        context.fill()
        context.stroke()
        context.restore()

        context.font = `700 ${Math.max(11, size * 0.024)}px system-ui, sans-serif`
        context.fillStyle = '#ffffff'
        context.fillText('Estás aquí', point.x, point.y + 26)
    }
}
