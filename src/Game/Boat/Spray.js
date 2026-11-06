import * as THREE from 'three/webgpu'
import { waveHeight } from '../World/Waves.js'
import { Game } from '../Game.js'
import { TickOrder } from '../Ticker.js'

const COUNT = 120
const GRAVITY = 14

const _matrix = new THREE.Matrix4()
const _position = new THREE.Vector3()
const _scale = new THREE.Vector3()
const _quaternion = new THREE.Quaternion()
const _side = new THREE.Vector3()
const _bow = new THREE.Vector3()

// Water thrown up on both sides of the bow when the boat goes fast, falling
// back into the sea. One instanced mesh: a single draw call for all drops.
export class Spray {
    constructor() {
        this.game = Game.getInstance()
        const material = new THREE.MeshBasicMaterial({ color: '#f4fdff', transparent: true, opacity: 0.9 })
        this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 0), material, COUNT)
        this.mesh.frustumCulled = false
        this.game.rendering.scene.add(this.mesh)

        this.drops = Array.from({ length: COUNT }, () => ({ alive: false, position: new THREE.Vector3(), velocity: new THREE.Vector3(), size: 1, age: 0 }))
        this.cursor = 0
        this.spawnTimer = 0

        this.game.ticker.on(() => {
            const { gameDelta, elapsed } = this.game.ticker
            if (gameDelta > 0) this.update(gameDelta, elapsed)
        }, TickOrder.WAKE + 1)
    }

    emit(delta) {
        const boat = this.game.boat
        const speed = boat.state.speed
        if (boat.state.submerged === 0 || speed < 5) return

        // More spray the faster you go
        this.spawnTimer += delta * Math.min((speed - 5) * 9, 140)
        const rotation = boat.mesh.quaternion
        const velocity = boat.body.linvel()
        const { half } = boat
        while (this.spawnTimer > 1) {
            this.spawnTimer -= 1
            const drop = this.drops[this.cursor]
            this.cursor = (this.cursor + 1) % COUNT
            const side = Math.random() < 0.5 ? -1 : 1
            _bow.set(side * half.x * 0.8, -half.y * 0.6, half.z * (0.45 + Math.random() * 0.35)).applyQuaternion(rotation).add(boat.mesh.position)
            _side.set(side, 0, 0).applyQuaternion(rotation)
            const outwards = 1.5 + Math.random() * 2.5
            drop.alive = true
            drop.age = 0
            drop.size = 0.6 + Math.random() * 0.9
            drop.position.copy(_bow)
            drop.velocity.set(
                velocity.x * 0.6 + _side.x * outwards,
                2.5 + Math.random() * 2.5 + speed * 0.08,
                velocity.z * 0.6 + _side.z * outwards
            )
        }
    }

    // A burst of drops anywhere (a dolphin diving, a fish jumping…)
    splash(x, y, z, count = 12, strength = 1) {
        for (let i = 0; i < count; i++) {
            const drop = this.drops[this.cursor]
            this.cursor = (this.cursor + 1) % COUNT
            const angle = Math.random() * Math.PI * 2
            const outwards = (0.8 + Math.random() * 1.8) * strength
            drop.alive = true
            drop.age = 0
            drop.size = 0.5 + Math.random() * 0.8
            drop.position.set(x, y + 0.1, z)
            drop.velocity.set(Math.cos(angle) * outwards, (2.5 + Math.random() * 2.5) * strength, Math.sin(angle) * outwards)
        }
    }

    update(delta, time) {
        this.emit(delta)
        for (let i = 0; i < COUNT; i++) {
            const drop = this.drops[i]
            if (drop.alive) {
                drop.age += delta
                drop.velocity.y -= GRAVITY * delta
                drop.position.addScaledVector(drop.velocity, delta)
                // Back in the water (or too old): gone
                if (drop.position.y < waveHeight(drop.position.x, drop.position.z, time) - 0.1 || drop.age > 1.5) drop.alive = false
            }
            _position.copy(drop.position)
            _scale.setScalar(drop.alive ? drop.size * (1 - drop.age / 1.5) : 0)
            _matrix.compose(_position, _quaternion, _scale)
            this.mesh.setMatrixAt(i, _matrix)
        }
        this.mesh.instanceMatrix.needsUpdate = true
    }
}
