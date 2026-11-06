import * as THREE from 'three/webgpu'
import { positionLocal, positionGeometry, sin, vec3, float, smoothstep, color } from 'three/tsl'
import { shoreDistanceAt } from '../Water.js'
import { shared } from '../shared.js'

const LENGTH = 70
const SPEED = 9
// Seconds between chances, and the chance each time
const CHECK_EVERY = 18
const CHANCE = 0.3
const DEPTH = { hidden: 16, visible: 4.5 }

// Half width along the body (t: 0 head … 1 tail), with two pairs of fins
function halfWidth(t) {
    const head = t < 0.05 ? 1.2 + (t / 0.05) * 1.3 : 2.5 - Math.min(1, (t - 0.05) / 0.05) * 0.7
    const body = 2.1 * (1 - THREE.MathUtils.smoothstep(t, 0.5, 1)) + 0.12
    const fin = (center) => Math.max(0, 1 - Math.abs(t - center) / 0.035) * 2.6
    return (t < 0.1 ? head : body) + fin(0.16) + fin(0.42)
}

// A strip lying flat on the water plane, the head at z = 0 and the body toward -z
function createBody() {
    const segments = 160
    const positions = []
    const row = (i) => {
        const t = i / segments
        const w = halfWidth(t)
        return [[-w, 0, -t * LENGTH], [w, 0, -t * LENGTH]]
    }
    for (let i = 0; i < segments; i++) {
        const [a, b] = row(i)
        const [c, d] = row(i + 1)
        // Two triangles facing up
        positions.push(...a, ...c, ...b, ...b, ...c, ...d)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.computeVertexNormals()
    return geometry
}

// Sometimes, seen from high above (overview camera), the dark shape of a
// gigantic sea serpent glides deep under the water across the view. It's a
// flat dark body that swims in the vertex shader (a wave running down to the
// tail); the water's depth tint turns it into a shadow.
export class Serpent {
    constructor({ scene, sound }) {
        this.sound = sound
        const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })
        const along = positionGeometry.z.negate().div(LENGTH)
        const amplitude = smoothstep(0, 0.35, along).mul(3.5).add(0.6)
        const wave = sin(positionGeometry.z.mul(0.11).add(shared.time.mul(2.2))).mul(amplitude)
        material.positionNode = positionLocal.add(vec3(wave, float(0), float(0)))
        material.colorNode = color('#03101c')
        this.mesh = new THREE.Mesh(createBody(), material)
        this.mesh.visible = false
        this.mesh.frustumCulled = false
        scene.add(this.mesh)
        this.clock = CHECK_EVERY
        this.active = null
    }

    setup(enabled, islands) {
        this.enabled = enabled
        this.islands = islands
        this.active = null
        this.mesh.visible = false
    }

    update(delta, view) {
        if (!this.enabled) return
        if (!this.active) {
            // Only when looking from high above
            if (view.mode !== 'overview') return
            this.clock -= delta
            if (this.clock > 0) return
            this.clock = CHECK_EVERY
            if (Math.random() < CHANCE) this.start(view.smoothTarget)
            return
        }

        const state = this.active
        state.travelled += SPEED * delta
        const head = state.from.clone().addScaledVector(state.direction, state.travelled)
        // Rises from the deep at the start, sinks back at the end
        const total = state.distance
        const fade = Math.min(1, state.travelled / 25, (total - state.travelled) / 25)
        this.mesh.position.set(head.x, -THREE.MathUtils.lerp(DEPTH.hidden, DEPTH.visible, Math.max(0, fade)), head.z)
        if (state.travelled >= total) {
            this.active = null
            this.mesh.visible = false
        }
    }

    // A path crossing near the point the camera looks at, through open water if possible
    start(target) {
        let best = null
        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2
            const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
            const side = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar((Math.random() - 0.5) * 30)
            const middle = target.clone().add(side)
            const clear = shoreDistanceAt(middle.x, middle.z, this.islands)
            if (!best || clear > best.clear) best = { direction, middle, clear }
        }
        if (!best || best.clear < 6) return
        const distance = 200
        const from = best.middle.clone().addScaledVector(best.direction, -distance / 2)
        this.active = { from, direction: best.direction, distance: distance + LENGTH, travelled: 0 }
        this.mesh.rotation.y = Math.atan2(best.direction.x, best.direction.z)
        this.mesh.position.set(from.x, -DEPTH.hidden, from.z)
        this.mesh.visible = true
        this.sound('rumble')
    }
}
