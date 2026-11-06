import { Game } from '../Game.js'
import * as THREE from 'three/webgpu'
import { TickOrder } from '../Ticker.js'

const _forward = new THREE.Vector3()

// Knows which interactive zone the boat is in (a project, a boat in the
// showroom...). Triggers 'zone:change' (active, previous) with the zone's
// payload, e.g. { type: 'project', project } or { type: 'boat', id }, so the
// UI, audio or anything else can react.
export class Zones {
    constructor() {
        this.game = Game.getInstance()
        this.entries = []
        this.active = null

        this.game.ticker.on(() => this.update(), TickOrder.ZONES)
    }

    // Called by World after every (re)build
    setEntries(entries) {
        this.entries = entries
    }

    update() {
        const { mesh, half } = this.game.boat
        const position = mesh.position
        const time = this.game.ticker.elapsed
        // The whole hull counts, not only its center: long boats enter a zone
        // as soon as the bow (or the stern, or a side) touches it
        _forward.set(0, 0, 1).applyQuaternion(mesh.quaternion).setY(0).normalize()
        let active = null
        let nearest = Infinity
        for (const zone of this.entries) {
            const dx = zone.x - position.x
            const dz = zone.z - position.z
            const along = THREE.MathUtils.clamp(dx * _forward.x + dz * _forward.z, -half.z, half.z)
            const distance = Math.max(0, Math.hypot(dx - _forward.x * along, dz - _forward.z * along) - half.x)
            const inside = distance < zone.radius + 0.5
            zone.update?.(time, inside)
            if (inside && distance < nearest) {
                nearest = distance
                active = zone.payload
            }
        }

        if (active !== this.active) {
            const previous = this.active
            this.active = active
            this.game.events.trigger('zone:change', active, previous)
        }
    }
}
