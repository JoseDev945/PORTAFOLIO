import * as THREE from 'three/webgpu'
import { positionLocal, positionGeometry, instanceIndex, hash, sin, max, vec3, float } from 'three/tsl'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { shared } from '../shared.js'
import { seabedDepth } from '../Water.js'

const SCHOOL_SIZE = 14
const COLORS = ['#ff8c42', '#ffd166', '#4cc9f0', '#f72585', '#06d6a0', '#ffffff']
const FLEE_RADIUS = 9

const _matrix = new THREE.Matrix4()
const _position = new THREE.Vector3()
const _quaternion = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _offset = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _color = new THREE.Color()

// Low poly fish facing +z: a diamond body and a vertical tail fin
function fishGeometry() {
    const body = new THREE.OctahedronGeometry(0.5, 0)
    body.scale(0.16, 0.24, 0.42)
    const tail = new THREE.BufferGeometry()
    tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.32, 0, 0.17, -0.6, 0, -0.17, -0.6], 3))
    tail.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 1, 1, 0], 2))
    tail.computeVertexNormals()
    return mergeGeometries([body.toNonIndexed(), tail])
}

// Schools of tropical fish circling the islands in the shallows. They scatter
// away from the boat when it comes close. All fish are one instanced mesh
// (one draw call) and their tails wiggle in the vertex shader.
export class Fish {
    constructor({ scene, rand }) {
        this.rand = rand
        this.scene = scene
        this.schools = []

        const material = new THREE.MeshLambertNodeMaterial({ flatShading: true, side: THREE.DoubleSide })
        // Tail wiggle: the further back a vertex is, the more it swings
        // (positionGeometry: the fish's own space; positionLocal already has the instance placement)
        const behind = max(positionGeometry.z.negate().sub(0.05), 0)
        const phase = hash(instanceIndex).mul(6.283)
        const swing = sin(shared.time.mul(14).add(phase)).mul(behind).mul(0.55)
        material.positionNode = positionLocal.add(vec3(swing, float(0), float(0)))
        this.material = material
        this.geometry = fishGeometry()
        this.mesh = null
    }

    // (Re)creates the schools around the islands
    setup(count, islands) {
        this.mesh?.removeFromParent()
        this.mesh?.dispose()
        this.schools = []
        this.islands = islands
        if (count === 0 || islands.length === 0) {
            this.mesh = null
            return
        }

        const rand = this.rand
        this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count * SCHOOL_SIZE)
        this.mesh.frustumCulled = false
        for (let s = 0; s < count; s++) {
            const home = islands[s % islands.length]
            const color = COLORS[Math.floor(rand() * COLORS.length)]
            const school = {
                home,
                orbit: home.radius + 3 + rand() * 6,
                angle: rand() * Math.PI * 2,
                speed: (0.12 + rand() * 0.1) * (rand() < 0.5 ? -1 : 1),
                flee: new THREE.Vector3(),
                fish: []
            }
            for (let f = 0; f < SCHOOL_SIZE; f++) {
                const index = s * SCHOOL_SIZE + f
                school.fish.push({
                    index,
                    offset: new THREE.Vector3((rand() - 0.5) * 3, (rand() - 0.5) * 0.7, (rand() - 0.5) * 3),
                    size: 1.2 + rand() * 0.6,
                    phase: rand() * 10
                })
                // Mostly the school's color, a few odd ones
                this.mesh.setColorAt(index, _color.set(rand() < 0.85 ? color : COLORS[Math.floor(rand() * COLORS.length)]))
            }
            this.schools.push(school)
        }
        this.scene.add(this.mesh)
    }

    update(delta, time, boat) {
        if (!this.mesh) return
        for (const school of this.schools) {
            // Scatter away from the boat, faster while it's close
            const cx = school.home.x + Math.cos(school.angle) * school.orbit
            const cz = school.home.z + Math.sin(school.angle) * school.orbit
            const dx = cx - boat.x
            const dz = cz - boat.z
            const distance = Math.hypot(dx, dz)
            const scared = distance < FLEE_RADIUS
            if (scared) _offset.set(dx / distance, 0, dz / distance).multiplyScalar((FLEE_RADIUS - distance) * 1.4)
            else _offset.set(0, 0, 0)
            school.flee.lerp(_offset, 1 - Math.exp(-delta * (scared ? 6 : 0.8)))
            school.angle += school.speed * delta * (scared ? 3 : 1)

            const x = cx + school.flee.x
            const z = cz + school.flee.z
            // Stay between the seabed and the surface
            const depth = seabedDepth(x, z, this.islands)
            const y = -Math.max(0.7, Math.min(depth - 0.6, 2))
            // Swim along the circle
            const heading = Math.atan2(-Math.sin(school.angle) * Math.sign(school.speed), Math.cos(school.angle) * Math.sign(school.speed))
            _quaternion.setFromAxisAngle(_up, heading)

            for (const fish of school.fish) {
                _offset.copy(fish.offset).applyQuaternion(_quaternion)
                _position.set(
                    x + _offset.x + Math.sin(time * 1.3 + fish.phase) * 0.15,
                    y + _offset.y * 0.6 + Math.sin(time * 1.7 + fish.phase) * 0.08,
                    z + _offset.z
                )
                _scale.setScalar(fish.size)
                _matrix.compose(_position, _quaternion, _scale)
                this.mesh.setMatrixAt(fish.index, _matrix)
            }
        }
        this.mesh.instanceMatrix.needsUpdate = true
    }
}
