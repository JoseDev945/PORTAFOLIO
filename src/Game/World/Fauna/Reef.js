import * as THREE from 'three/webgpu'
import { positionLocal, positionGeometry, positionWorld, instanceIndex, hash, sin, mix, vec3, float, color } from 'three/tsl'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { shared } from '../shared.js'
import { seabedDepth } from '../Water.js'

const _matrix = new THREE.Matrix4()
const _position = new THREE.Vector3()
const _quaternion = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _euler = new THREE.Euler()
const _color = new THREE.Color()

function brainCoral() {
    const geometry = new THREE.DodecahedronGeometry(0.5, 0)
    geometry.scale(1, 0.6, 1)
    return geometry.toNonIndexed()
}

function branchCoral() {
    const parts = []
    for (const [x, z, tilt, height] of [[0, 0, 0, 1], [0.18, 0.05, 0.4, 0.75], [-0.15, 0.1, -0.45, 0.8], [0.05, -0.18, 0.3, 0.6]]) {
        const branch = new THREE.CylinderGeometry(0.05, 0.09, height, 5)
        branch.translate(0, height / 2, 0)
        branch.rotateZ(tilt)
        branch.rotateY(x * 9)
        branch.translate(x, 0, z)
        parts.push(branch.toNonIndexed())
    }
    return mergeGeometries(parts)
}

function seaweed() {
    const geometry = new THREE.BoxGeometry(0.12, 1.6, 0.04, 1, 6, 1)
    geometry.translate(0, 0.8, 0)
    return geometry.toNonIndexed()
}

function starfish() {
    const shape = new THREE.Shape()
    for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2
        const radius = i % 2 === 0 ? 0.32 : 0.12
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius
        if (i === 0) shape.moveTo(x, y)
        else shape.lineTo(x, y)
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false })
    geometry.rotateX(-Math.PI / 2)
    return geometry.toNonIndexed()
}

// Sea anemone: a squat base crowned with tentacles leaning outwards
function anemone() {
    const parts = [new THREE.CylinderGeometry(0.16, 0.2, 0.16, 7).translate(0, 0.08, 0).toNonIndexed()]
    for (let i = 0; i < 11; i++) {
        const angle = (i / 11) * Math.PI * 2
        const ring = i % 2 === 0 ? 0.12 : 0.06
        const tentacle = new THREE.ConeGeometry(0.03, 0.38, 4)
        tentacle.translate(0, 0.19, 0)
        tentacle.rotateZ(-0.5 - (ring > 0.1 ? 0.25 : 0))
        tentacle.rotateY(angle)
        tentacle.translate(Math.cos(angle) * ring, 0.14, -Math.sin(angle) * ring)
        parts.push(tentacle.toNonIndexed())
    }
    return mergeGeometries(parts)
}

// Sea fan (gorgonian): a flat half disc on a short stem
function seaFan() {
    const fan = new THREE.CircleGeometry(0.7, 9, 0, Math.PI)
    fan.translate(0, 0.12, 0)
    const stem = new THREE.CylinderGeometry(0.03, 0.05, 0.2, 4).translate(0, 0.1, 0)
    return mergeGeometries([fan.toNonIndexed(), stem.toNonIndexed()])
}

// Tube sponges: a few open tubes of different heights
function tubeSponge() {
    const parts = []
    for (const [x, z, height, radius] of [[0, 0, 0.9, 0.11], [0.2, 0.08, 0.6, 0.09], [-0.12, 0.17, 0.5, 0.08], [0.06, -0.2, 0.7, 0.1]]) {
        const tube = new THREE.CylinderGeometry(radius, radius * 0.8, height, 7, 1, true)
        tube.translate(x, height / 2, z)
        parts.push(tube.toNonIndexed())
    }
    return mergeGeometries(parts)
}

// Each kind of reef life: geometry, day colors, the two colors it glows with
// at night (each instance mixes them), how many per meter of island radius,
// how far from the beach, size range
const KINDS = [
    { name: 'brain', geometry: brainCoral, colors: ['#e76f9b', '#b56bd6', '#f4a261'], glow: ['#ff4fd8', '#9b6bff'], strength: 2.2, perRadius: 1.6, shore: [1.5, 9], size: [0.6, 1.4] },
    { name: 'branch', geometry: branchCoral, colors: ['#ff8c42', '#ffd166', '#ef476f'], glow: ['#ff9a3d', '#ff4f8f'], strength: 2.6, perRadius: 1.8, shore: [1.5, 8], size: [0.7, 1.5] },
    { name: 'seaweed', geometry: seaweed, colors: ['#2a9d4a', '#4caf50', '#1b7a3a'], glow: ['#3dffb0', '#2fd3ff'], strength: 1.4, perRadius: 2.5, shore: [2, 12], size: [0.6, 1.4], sway: 0.08 },
    { name: 'starfish', geometry: starfish, colors: ['#ff6b35', '#e63946', '#ffb703'], glow: ['#ff7b3d', '#ffe14d'], strength: 1.8, perRadius: 0.9, shore: [1, 6], size: [0.8, 1.3], flat: true },
    { name: 'anemone', geometry: anemone, colors: ['#f2a7c3', '#9be7d9', '#c9b6ff'], glow: ['#3df5ff', '#d36bff'], strength: 3.2, perRadius: 1.2, shore: [1.5, 7], size: [0.9, 1.6], sway: 0.25 },
    { name: 'fan', geometry: seaFan, colors: ['#8e5bd6', '#e05aa8', '#f2c14e'], glow: ['#7a5cff', '#ff5ccf'], strength: 2.4, perRadius: 0.9, shore: [2, 10], size: [0.8, 1.6], sway: 0.05, doubleSide: true },
    { name: 'tube', geometry: tubeSponge, colors: ['#f4a261', '#c77dff', '#ffd166'], glow: ['#5fff7a', '#3dd6ff'], strength: 2.6, perRadius: 0.8, shore: [2, 9], size: [0.8, 1.4], doubleSide: true }
]

// Corals, anemones, sponges, seaweed and starfish on the seabed around every
// island, seen through the transparent water. At night they light up in
// bioluminescent colors that slowly pulse. One instanced mesh per kind.
export class Reef {
    constructor({ scene, rand }) {
        this.scene = scene
        this.rand = rand
        this.meshes = []
        this.geometries = Object.fromEntries(KINDS.map((kind) => [kind.name, kind.geometry()]))
        this.materials = Object.fromEntries(KINDS.map((kind) => [kind.name, createMaterial(kind)]))
    }

    setup(enabled, islands) {
        for (const mesh of this.meshes) {
            mesh.removeFromParent()
            mesh.dispose()
        }
        this.meshes = []
        if (!enabled || islands.length === 0) return

        const rand = this.rand
        for (const kind of KINDS) {
            const placements = []
            for (const island of islands) {
                const count = Math.round(island.radius * kind.perRadius)
                for (let i = 0; i < count; i++) {
                    const angle = rand() * Math.PI * 2
                    const distance = island.radius + THREE.MathUtils.lerp(kind.shore[0], kind.shore[1], rand())
                    const x = island.x + Math.cos(angle) * distance
                    const z = island.z + Math.sin(angle) * distance
                    placements.push({ x, z, y: -seabedDepth(x, z, islands) })
                }
            }
            const mesh = new THREE.InstancedMesh(this.geometries[kind.name], this.materials[kind.name], placements.length)
            placements.forEach(({ x, y, z }, index) => {
                _position.set(x, y - 0.05, z)
                _quaternion.setFromEuler(_euler.set(kind.flat ? 0 : (rand() - 0.5) * 0.3, rand() * Math.PI * 2, kind.flat ? 0 : (rand() - 0.5) * 0.3))
                _scale.setScalar(THREE.MathUtils.lerp(kind.size[0], kind.size[1], rand()))
                _matrix.compose(_position, _quaternion, _scale)
                mesh.setMatrixAt(index, _matrix)
                mesh.setColorAt(index, _color.set(kind.colors[Math.floor(rand() * kind.colors.length)]))
            })
            mesh.receiveShadow = true
            this.scene.add(mesh)
            this.meshes.push(mesh)
        }
    }
}

function createMaterial(kind) {
    const material = new THREE.MeshLambertNodeMaterial({ flatShading: true, side: kind.doubleSide ? THREE.DoubleSide : THREE.FrontSide })
    const seed = hash(instanceIndex)
    if (kind.sway) {
        // Sways with the current, more at the top (positionGeometry: the
        // plant's own height; positionLocal already has the instance placement)
        const height = positionGeometry.y
        const bend = sin(shared.time.mul(1.4).add(seed.mul(6.283))).mul(height.mul(height)).mul(kind.sway)
        material.positionNode = positionLocal.add(vec3(bend, float(0), bend.mul(0.5)))
    }
    // Bioluminescence: each one picks its tint between the two glow colors and
    // pulses slowly, out of step with its neighbours. Only at night.
    const tint = mix(color(kind.glow[0]), color(kind.glow[1]), seed)
    const pulse = sin(shared.time.mul(0.9).add(seed.mul(20)).add(positionWorld.x.mul(0.3))).mul(0.35).add(0.65)
    material.emissiveNode = tint.mul(pulse).mul(shared.night).mul(kind.strength)
    return material
}
