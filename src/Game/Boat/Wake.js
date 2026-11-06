import * as THREE from 'three/webgpu'
import { waveHeight } from '../World/Waves.js'
import { Game } from '../Game.js'
import { TickOrder } from '../Ticker.js'

const COUNT = 140
const LIFE = 2.2

// Foam blobs dropped behind the motor, they grow and shrink while drifting on the waves
export class Wake {
    constructor() {
        this.game = Game.getInstance()
        const geometry = new THREE.CircleGeometry(0.5, 7)
        geometry.rotateX(-Math.PI / 2)
        const material = new THREE.MeshBasicMaterial({ color: '#f4fdff', transparent: true, opacity: 0.85, depthWrite: false })
        this.mesh = new THREE.InstancedMesh(geometry, material, COUNT)
        this.mesh.frustumCulled = false
        this.game.rendering.scene.add(this.mesh)

        this.particles = Array.from({ length: COUNT }, () => ({ age: LIFE, x: 0, z: 0, vx: 0, vz: 0, size: 1 }))
        this.cursor = 0
        this.spawnTimer = 0
        this.matrix = new THREE.Matrix4()
        this.scale = new THREE.Vector3()
        this.position = new THREE.Vector3()
        this.quaternion = new THREE.Quaternion()

        this.game.ticker.on(() => {
            const { gameDelta, elapsed } = this.game.ticker
            if (gameDelta > 0) this.update(gameDelta, elapsed, this.game.boat)
        }, TickOrder.WAKE)
    }

    emit(boat, delta) {
        const speed = Math.abs(boat.state.speed)
        if (boat.state.submerged === 0 || speed < 1.5) return

        this.spawnTimer += delta * Math.min(speed * 4, 50)
        const rotation = boat.mesh.quaternion
        const right = this.position.set(1, 0, 0).applyQuaternion(rotation).clone()
        const stern = this.position.set(0, 0, -boat.half.z - 0.4).applyQuaternion(rotation).add(boat.mesh.position)

        while (this.spawnTimer > 1) {
            this.spawnTimer -= 1
            const particle = this.particles[this.cursor]
            this.cursor = (this.cursor + 1) % COUNT
            const side = Math.random() - 0.5
            particle.age = 0
            particle.x = stern.x + right.x * side * 1.4
            particle.z = stern.z + right.z * side * 1.4
            particle.vx = right.x * side * 2
            particle.vz = right.z * side * 2
            particle.size = 0.6 + Math.random() * 0.6 + speed * 0.04
        }
    }

    update(delta, time, boat) {
        this.emit(boat, delta)

        for (let i = 0; i < COUNT; i++) {
            const particle = this.particles[i]
            particle.age += delta
            const progress = particle.age / LIFE
            if (progress >= 1) {
                this.scale.setScalar(0)
            } else {
                particle.x += particle.vx * delta
                particle.z += particle.vz * delta
                const grow = Math.sin(Math.min(progress * 4, 1) * Math.PI * 0.5)
                this.scale.setScalar(particle.size * grow * (1 - progress) * 1.6)
            }
            this.position.set(particle.x, waveHeight(particle.x, particle.z, time) + 0.06, particle.z)
            this.matrix.compose(this.position, this.quaternion, this.scale)
            this.mesh.setMatrixAt(i, this.matrix)
        }
        this.mesh.instanceMatrix.needsUpdate = true
    }
}
