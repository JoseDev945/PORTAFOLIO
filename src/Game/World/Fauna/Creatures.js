import * as THREE from 'three/webgpu'
import { positionLocal, positionGeometry, instanceIndex, hash, sin, vec3, float, color, max } from 'three/tsl'
import { mergeByMaterial } from '../../utils/merge.js'
import { waveHeight } from '../Waves.js'
import { shoreDistanceAt, seabedDepth } from '../Water.js'
import { shared } from '../shared.js'

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra })
const randomIn = (min, max) => min + Math.random() * (max - min)
const smooth = (t) => t * t * (3 - 2 * t)
const _forward = new THREE.Vector3()
const _point = new THREE.Vector3()

// ---------- Models (all facing +z) ----------

function createWhale() {
    const whale = new THREE.Group()
    const body = new THREE.Group()
    const dark = lambert('#34465a')
    const light = lambert('#c9d3dc')
    const back = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), dark)
    back.scale.set(1.6, 1.3, 6)
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), light)
    belly.scale.set(1.3, 0.9, 5.2)
    belly.position.y = -0.45
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4), dark)
    dorsal.scale.z = 2
    dorsal.position.set(0, 1.3, -2.6)
    dorsal.rotation.x = -0.5
    body.add(back, belly, dorsal)
    // Long pectoral fins, humpback style
    for (const side of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.8), light)
        fin.position.set(side * 2.6, -0.7, 2)
        fin.rotation.set(0, side * 0.5, side * -0.45)
        body.add(fin)
    }
    const stock = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5), dark)
    stock.scale.set(0.6, 0.6, 2)
    stock.position.z = -5.8
    body.add(stock)
    mergeByMaterial(body, { castShadow: false, receiveShadow: false })
    whale.add(body)
    // Flukes on a pivot, they beat while swimming
    const flukes = new THREE.Group()
    flukes.position.z = -7.4
    for (const side of [-1, 1]) {
        const half = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 0.9), dark)
        half.position.set(side * 1.1, 0, -0.25)
        half.rotation.y = side * 0.35
        flukes.add(half)
    }
    whale.add(flukes)
    whale.userData.flukes = flukes
    return whale
}

function createManta() {
    const manta = new THREE.Group()
    const top = lambert('#20262f', { side: THREE.DoubleSide })
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), top)
    body.scale.set(0.6, 0.18, 1.1)
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 1.8, 4), top)
    tail.rotation.x = Math.PI / 2
    tail.position.z = -1.9
    manta.add(body, tail)
    for (const side of [-1, 1]) {
        const lobe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.45), top)
        lobe.position.set(side * 0.3, 0, 1.1)
        manta.add(lobe)
    }
    // Wings: a triangle each, pivoting at the body edge
    const wings = []
    for (const side of [-1, 1]) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.9, side * 2.2, 0, -0.3, 0, 0, -0.9], 3))
        geometry.computeVertexNormals()
        const pivot = new THREE.Group()
        pivot.position.x = side * 0.5
        pivot.add(new THREE.Mesh(geometry, top))
        manta.add(pivot)
        wings.push(pivot)
    }
    manta.userData.wings = wings
    return manta
}

function createShark() {
    const shark = new THREE.Group()
    const gray = lambert('#5d6b78')
    const shape = new THREE.Shape()
    shape.moveTo(-0.45, 0)
    shape.lineTo(0.5, 0)
    shape.quadraticCurveTo(0.1, 0.4, -0.35, 1.05)
    shape.closePath()
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false }), gray)
    // Shape (x, y) -> fin along z: sweeping back
    fin.rotation.y = -Math.PI / 2
    fin.position.set(-0.035, 0, 0)
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), gray)
    body.scale.set(0.45, 0.45, 2.4)
    body.position.y = -0.55
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 3), gray)
    tail.scale.z = 0.2
    tail.position.set(0, -0.35, -2.5)
    tail.rotation.x = -0.6
    shark.add(fin, body, tail)
    return shark
}

// Jellyfish: a bell and a few tentacles; one instanced mesh for all of them
function jellyfishGeometry() {
    const parts = [new THREE.SphereGeometry(0.35, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed()]
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2
        const tentacle = new THREE.ConeGeometry(0.03, 0.9, 3)
        tentacle.rotateX(Math.PI)
        tentacle.translate(Math.cos(angle) * 0.2, -0.45, Math.sin(angle) * 0.2)
        parts.push(tentacle.toNonIndexed())
    }
    const positions = parts.flatMap((part) => [...part.attributes.position.array])
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.computeVertexNormals()
    return geometry
}

// ---------- Sightings ----------

// Now and then something shows up around the boat: a whale that surfaces,
// blows and dives showing its flukes; a pair of manta rays gliding under the
// boat (one leaps); a shark fin circling you. One at a time, every
// `creatureEvery` seconds on average. Jellyfish drift in the shallows and
// glow at night.
export class Creatures {
    constructor({ scene, splash }) {
        this.scene = scene
        this.splash = splash
        this.whale = createWhale()
        this.mantas = [createManta(), createManta()]
        this.shark = createShark()
        for (const object of [this.whale, ...this.mantas, this.shark]) {
            object.visible = false
            scene.add(object)
        }
        this.active = null
        this.timer = 25

        const material = new THREE.MeshLambertNodeMaterial({ flatShading: true })
        const seed = hash(instanceIndex)
        // Bob up and down, the bell squeezes as it swims (positionGeometry: the
        // jellyfish's own shape; positionLocal already has the instance placement)
        const pulse = sin(shared.time.mul(2).add(seed.mul(30)))
        const squeeze = positionGeometry.xz.mul(pulse.mul(0.12)).mul(max(positionGeometry.y, 0).mul(3))
        material.positionNode = positionLocal.add(vec3(squeeze.x, sin(shared.time.mul(0.7).add(seed.mul(9))).mul(0.25), squeeze.y))
        material.colorNode = color('#f2b5d4')
        const glow = pulse.mul(0.3).add(0.7)
        material.emissiveNode = color('#ff6bd5').mul(glow).mul(shared.night).mul(2.2).add(color('#5a2a48').mul(float(1).sub(shared.night)).mul(0.3))
        this.jellyMaterial = material
        this.jellyGeometry = jellyfishGeometry()
        this.jellies = null
    }

    setup(enabled, islands, every) {
        this.enabled = enabled
        this.islands = islands
        this.every = every
        this.end()
        this.jellies?.removeFromParent()
        this.jellies?.dispose()
        this.jellies = null
        if (!enabled || islands.length === 0) return

        const spots = []
        for (const island of islands) {
            const count = Math.round(island.radius * 0.6)
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2
                const distance = island.radius + randomIn(4, 14)
                const x = island.x + Math.cos(angle) * distance
                const z = island.z + Math.sin(angle) * distance
                const depth = Math.min(seabedDepth(x, z, islands) - 0.8, randomIn(0.8, 2))
                if (depth > 0.5) spots.push([x, -depth, z, randomIn(0.7, 1.3)])
            }
        }
        const mesh = new THREE.InstancedMesh(this.jellyGeometry, this.jellyMaterial, spots.length)
        const matrix = new THREE.Matrix4()
        spots.forEach(([x, y, z, scale], index) => mesh.setMatrixAt(index, matrix.makeScale(scale, scale, scale).setPosition(x, y, z)))
        this.scene.add(mesh)
        this.jellies = mesh
    }

    update(delta, time, boat) {
        if (!this.enabled) return
        if (this.active) {
            this.active.t += delta
            if (this.active.run(this.active, delta, time) === false) {
                this.end()
                this.timer = randomIn(this.every * 0.6, this.every * 1.4)
            }
            return
        }
        this.timer -= delta
        if (this.timer > 0) return
        const kinds = ['whale', 'mantas', 'shark'].sort(() => Math.random() - 0.5)
        const started = kinds.some((kind) => this.start(kind, boat))
        // Nowhere to show up right now (near the islands): try again soon
        if (!started) this.timer = 8
    }

    end() {
        this.active = null
        for (const object of [this.whale, ...this.mantas, this.shark]) object.visible = false
    }

    // A point at `distance` from the boat with enough open water around it
    openSpot(boat, distance, clearance) {
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2
            const x = boat.mesh.position.x + Math.cos(angle) * distance
            const z = boat.mesh.position.z + Math.sin(angle) * distance
            if (shoreDistanceAt(x, z, this.islands) > clearance && Math.hypot(x, z) < 140) return new THREE.Vector3(x, 0, z)
        }
        return null
    }

    start(kind, boat) {
        if (kind === 'whale') {
            const spot = this.openSpot(boat, randomIn(30, 42), 20)
            if (!spot) return false
            // Swims across your view: perpendicular to the line to the boat
            const toBoat = Math.atan2(boat.mesh.position.x - spot.x, boat.mesh.position.z - spot.z)
            this.active = { t: 0, spot, heading: toBoat + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2, blows: [3.5, 6.5, 9], dived: false, run: (state, delta, time) => this.runWhale(state, delta, time) }
            this.whale.visible = true
            return true
        }
        if (kind === 'mantas') {
            const spot = this.openSpot(boat, 16, 6)
            if (!spot) return false
            // Glide past the boat
            const heading = Math.atan2(boat.mesh.position.x - spot.x, boat.mesh.position.z - spot.z) + randomIn(-0.4, 0.4)
            this.active = { t: 0, spot, heading, leapAt: randomIn(6, 11), leaped: false, wasAbove: false, run: (state, delta, time) => this.runMantas(state, delta, time) }
            for (const manta of this.mantas) manta.visible = true
            return true
        }
        const center = boat.mesh.position
        if (shoreDistanceAt(center.x, center.z, this.islands) < 10) return false
        this.active = { t: 0, center: center.clone(), angle: Math.random() * Math.PI * 2, splashClock: 0, run: (state, delta, time) => this.runShark(state, delta, time, boat) }
        this.shark.visible = true
        return true
    }

    runWhale(state, delta, time) {
        const whale = this.whale
        const duration = 17
        const { t } = state
        _forward.set(Math.sin(state.heading), 0, Math.cos(state.heading))
        state.spot.addScaledVector(_forward, delta * 2.2)
        const water = waveHeight(state.spot.x, state.spot.z, time)
        let y = -1
        let pitch = 0
        if (t < 3) y = THREE.MathUtils.lerp(-7, -1, smooth(t / 3))
        else if (t < 10) y = -1 + Math.sin(t * 1.3) * 0.12
        else {
            const u = Math.min(1, (t - 10) / 7)
            pitch = smooth(Math.min(1, u * 1.4)) * 1.15
            y = -1 - u * 3.5
            if (!state.dived && u > 0.75) {
                state.dived = true
                _point.set(0, 0, -7.4).applyEuler(whale.rotation).add(whale.position)
                this.splash(_point.x, water, _point.z, 30, 1.2)
            }
        }
        whale.position.set(state.spot.x, water + y, state.spot.z)
        whale.rotation.set(pitch, state.heading, 0, 'YXZ')
        whale.userData.flukes.rotation.x = Math.sin(t * 1.4) * 0.25
        // Blows through the blowhole
        if (state.blows.length && t > state.blows[0]) {
            state.blows.shift()
            _point.set(0, 1.3, 3.2).applyEuler(whale.rotation).add(whale.position)
            for (let i = 0; i < 3; i++) this.splash(_point.x, _point.y, _point.z, 14, 1.4 + i * 0.25)
        }
        return t < duration
    }

    runMantas(state, delta, time) {
        const duration = 22
        const { t } = state
        _forward.set(Math.sin(state.heading), 0, Math.cos(state.heading))
        state.spot.addScaledVector(_forward, delta * 2.4)
        const fade = Math.min(1, t / 3, (duration - t) / 3)
        this.mantas.forEach((manta, i) => {
            const side = i === 0 ? 0 : 4
            const x = state.spot.x - _forward.z * side - _forward.x * i * 3
            const z = state.spot.z + _forward.x * side - _forward.z * i * 3
            const water = waveHeight(x, z, time)
            let y = water - 1.2 - (1 - fade) * 3
            let roll = 0
            // The first one leaps out of the water once
            const leap = (t - state.leapAt) / 1.6
            if (i === 0 && leap > 0 && leap < 1) {
                y = water - 1.2 + Math.sin(leap * Math.PI) * 3.6
                roll = leap * Math.PI * 2
            }
            if (i === 0) {
                const above = y > water
                if (above !== state.wasAbove) this.splash(x, water, z, 18, above ? 0.8 : 1.2)
                state.wasAbove = above
            }
            manta.position.set(x, y, z)
            manta.rotation.set(0, state.heading, roll, 'YXZ')
            const flap = Math.sin(t * 2.2 + i) * 0.45
            manta.userData.wings[0].rotation.z = -flap
            manta.userData.wings[1].rotation.z = flap
        })
        return t < duration
    }

    runShark(state, delta, time, boat) {
        const duration = 22
        const { t } = state
        // Follows the boat around, closing in and then leaving
        state.center.lerp(boat.mesh.position, 1 - Math.exp(-delta * 0.8))
        const radius = 9 + (1 - Math.min(1, t / 4, (duration - t) / 4)) * 14
        state.angle += (4 / radius) * delta
        const x = state.center.x + Math.cos(state.angle) * radius
        const z = state.center.z + Math.sin(state.angle) * radius
        const water = waveHeight(x, z, time)
        const rise = Math.min(1, t / 2, (duration - t) / 2)
        this.shark.position.set(x, water - 0.95 + rise * 0.7, z)
        // Tangent to the circle
        this.shark.rotation.set(0, Math.atan2(-Math.sin(state.angle), Math.cos(state.angle)), Math.sin(t * 3) * 0.06, 'YXZ')
        state.splashClock -= delta
        if (state.splashClock <= 0 && rise > 0.5) {
            state.splashClock = 0.35
            this.splash(x, water, z, 3, 0.3)
        }
        return t < duration
    }
}
