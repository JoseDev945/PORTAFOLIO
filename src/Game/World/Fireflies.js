import * as THREE from 'three/webgpu'
import { positionLocal, instanceIndex, hash, sin, cos, max, vec3, color } from 'three/tsl'
import { Game } from '../Game.js'
import { TickOrder } from '../Ticker.js'
import { random } from '../utils/random.js'
import { shared } from './shared.js'

// Per square meter of island grass
const DENSITY = 0.12
const MAX = 600
const GLOW = '#d8ff6b'

// Fireflies over the islands at night: one instanced mesh of tiny bright
// specks. Each one wanders around its spot and blinks on its own rhythm, all
// in the vertex/fragment shader (no work on the CPU). Hidden by day.
export class Fireflies {
    constructor(world) {
        this.game = Game.getInstance()
        this.world = world
        this.scene = this.game.rendering.scene
        this.mesh = null

        this.geometry = new THREE.OctahedronGeometry(0.045, 0)
        const material = new THREE.MeshBasicNodeMaterial()
        const seed = hash(instanceIndex)
        const seed2 = hash(instanceIndex.toFloat().add(911))
        const time = shared.time
        // Lazy loops around the spot (positionLocal already has the instance placement)
        const drift = vec3(
            sin(time.mul(seed.mul(0.5).add(0.3)).add(seed.mul(40))).mul(0.9),
            sin(time.mul(seed2.mul(0.7).add(0.4)).add(seed2.mul(30))).mul(0.35),
            cos(time.mul(seed2.mul(0.5).add(0.25)).add(seed.mul(17))).mul(0.9)
        )
        material.positionNode = positionLocal.add(drift)
        // Blink: mostly dim, a bright flash now and then
        const blink = max(sin(time.mul(seed.mul(1.5).add(0.8)).add(seed2.mul(50))), 0).pow(3)
        const light = blink.mul(0.85).add(0.15).mul(shared.night)
        material.colorNode = color(GLOW).mul(light)
        material.emissiveNode = color(GLOW).mul(light).mul(4)
        this.material = material

        this.game.events.on('world:build', () => this.setup())
        this.game.ticker.on(() => this.update(), TickOrder.WORLD + 3)
    }

    setup() {
        this.mesh?.removeFromParent()
        this.mesh?.dispose()
        this.mesh = null
        if (!this.world.faunaConfig.fireflies) return

        const rand = random(77)
        const spots = []
        for (const island of this.world.islands) {
            if (!island.top) continue
            const count = Math.round(Math.PI * island.top * island.top * DENSITY)
            for (let i = 0; i < count && spots.length < MAX; i++) {
                const angle = rand() * Math.PI * 2
                const distance = Math.sqrt(rand()) * island.top * 1.15
                spots.push([island.x + Math.cos(angle) * distance, 1.6 + rand() * 2.4, island.z + Math.sin(angle) * distance])
            }
        }
        if (spots.length === 0) return

        const mesh = new THREE.InstancedMesh(this.geometry, this.material, spots.length)
        const matrix = new THREE.Matrix4()
        spots.forEach(([x, y, z], index) => mesh.setMatrixAt(index, matrix.makeTranslation(x, y, z)))
        mesh.frustumCulled = false
        mesh.visible = false
        this.scene.add(mesh)
        this.mesh = mesh
    }

    update() {
        // Only drawn when it's dark enough to see them
        if (this.mesh) this.mesh.visible = shared.night.value > 0.02
    }
}
