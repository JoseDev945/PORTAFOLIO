import * as THREE from 'three/webgpu'
import { bioMaterial, shadow } from '../materials.js'

// Grass on islands is 0.2 m above the prop's origin (groundY = 1, top at 1.2)
const SOIL = 0.2
const KINDS = ['mushroom', 'spiral', 'fern', 'pod']

// Glow colors at night (day colors are the first value)
const MAT = {
    stem: () => bioMaterial('#d9d0ea', '#9fe8ff', 0.5, { sway: true }),
    cap: () => bioMaterial('#7b3fc4', '#d070ff', 2.2, { sway: true }),
    gills: () => bioMaterial('#4fd8e8', '#3df5ff', 3, { sway: true, doubleSide: true }),
    spiralStem: () => bioMaterial('#4a3358', '#ff9a5c', 0.4, { sway: true }),
    spiral: () => bioMaterial('#e2572b', '#ffb35c', 1.8, { sway: true, doubleSide: true }),
    frond: () => bioMaterial('#1f7a6a', '#4dfff0', 2, { sway: true }),
    podStem: () => bioMaterial('#2c6b4f', '#5dffb0', 0.6, { sway: true }),
    pod: () => bioMaterial('#5fd0ff', '#5fb6ff', 3.2, { sway: true }),
    moss: () => bioMaterial('#3f8f5a', '#3dffc8', 1.4)
}

// Mushrooms with a glowing underside, 1 to 3 together
function mushroom(group, rand, size) {
    const count = 1 + Math.floor(rand() * 3)
    for (let i = 0; i < count; i++) {
        const height = (0.7 + rand() * 1.3) * size * (i === 0 ? 1 : 0.6)
        const radius = height * (0.35 + rand() * 0.15)
        const x = i === 0 ? 0 : (rand() - 0.5) * 1.2 * size
        const z = i === 0 ? 0 : (rand() - 0.5) * 1.2 * size
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.18, radius * 0.26, height + SOIL, 6), MAT.stem())
        stem.position.set(x, (height + SOIL) / 2, z)
        const cap = new THREE.Mesh(new THREE.SphereGeometry(radius, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), MAT.cap())
        cap.scale.y = 0.55
        cap.position.set(x, SOIL + height, z)
        const gills = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.96, 9), MAT.gills())
        gills.rotation.x = Math.PI / 2
        gills.position.set(x, SOIL + height - 0.01, z)
        group.add(shadow(stem), shadow(cap), gills)
    }
}

// Tall spiral plant (like a helicoradian): fronds winding up a thin stem
function spiral(group, rand, size) {
    const height = (2.2 + rand() * 1.4) * size
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, height + SOIL, 5), MAT.spiralStem())
    stem.position.y = (height + SOIL) / 2
    group.add(shadow(stem))
    const turns = 16
    const start = rand() * Math.PI * 2
    for (let i = 0; i < turns; i++) {
        const t = i / turns
        const width = (0.75 - t * 0.55) * size
        const frond = new THREE.Mesh(new THREE.BoxGeometry(width, 0.015, 0.26 * size), MAT.spiral())
        const angle = start + i * 0.85
        frond.position.set(Math.cos(angle) * width * 0.5, SOIL + 0.3 * size + t * height * 0.85, -Math.sin(angle) * width * 0.5)
        frond.rotation.set(0, angle, 0.35)
        group.add(shadow(frond))
    }
}

// Clump of curved glowing fronds
function fern(group, rand, size) {
    const count = 6 + Math.floor(rand() * 4)
    for (let i = 0; i < count; i++) {
        const length = (0.6 + rand() * 0.7) * size
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.07 * size, length, 4), MAT.frond())
        const angle = (i / count) * Math.PI * 2 + rand() * 0.4
        const tilt = 0.35 + rand() * 0.45
        frond.geometry.translate(0, length / 2, 0)
        frond.position.y = SOIL
        frond.rotation.set(0, angle, tilt, 'YXZ')
        group.add(shadow(frond))
    }
}

// Thin stems with glowing bulbs on top
function pod(group, rand, size) {
    const count = 3 + Math.floor(rand() * 3)
    for (let i = 0; i < count; i++) {
        const height = (0.5 + rand() * 0.9) * size
        const angle = rand() * Math.PI * 2
        const lean = rand() * 0.35
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, height + SOIL, 4), MAT.podStem())
        stem.geometry.translate(0, (height + SOIL) / 2, 0)
        stem.rotation.set(0, angle, lean, 'YXZ')
        const top = new THREE.Vector3(0, height + SOIL, 0).applyEuler(stem.rotation)
        const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry((0.08 + rand() * 0.07) * size, 0), MAT.pod())
        bulb.position.copy(top)
        group.add(shadow(stem), bulb)
    }
}

const BUILDERS = { mushroom, spiral, fern, pod }

export default {
    description: 'Planta luminiscente (de noche brilla)',
    schema: {
        kind: { type: 'enum', values: ['random', ...KINDS], default: 'random' },
        size: { type: 'number', default: 1, min: 0.3, max: 4 },
        // Glowing moss patches around the plant
        moss: { type: 'boolean', default: true }
    },
    create({ params, rand }) {
        const group = new THREE.Group()
        const kind = params.kind === 'random' ? KINDS[Math.floor(rand() * KINDS.length)] : params.kind
        BUILDERS[kind](group, rand, params.size)
        if (params.moss) {
            const patches = 2 + Math.floor(rand() * 3)
            for (let i = 0; i < patches; i++) {
                const patch = new THREE.Mesh(new THREE.CircleGeometry((0.15 + rand() * 0.25) * params.size, 6), MAT.moss())
                patch.rotation.x = -Math.PI / 2
                const angle = rand() * Math.PI * 2
                const distance = (0.3 + rand() * 0.7) * params.size
                // A hair above the grass (no z-fighting), each patch at its own height
                patch.position.set(Math.cos(angle) * distance, SOIL + 0.012 + i * 0.004, Math.sin(angle) * distance)
                group.add(patch)
            }
        }
        // Too small to need collisions (and the boat can't reach the island top)
        return { object: group, colliders: [] }
    }
}
