import * as THREE from 'three/webgpu'
import { mergeByMaterial } from '../../utils/merge.js'
import { waveHeight } from '../Waves.js'
import { shoreDistanceAt } from '../Water.js'

const gray = new THREE.MeshLambertMaterial({ color: '#7d98ad', flatShading: true })
const belly = new THREE.MeshLambertMaterial({ color: '#d7e3ea', flatShading: true })

// Faster than this in open water and the pod comes to swim with you
const ESCORT_SPEED = 7
// Seconds of fast sailing in open water between two tries of the dice
const CHECK_EVERY = 12
// How long a visit lasts, in seconds
const VISIT = [25, 45]
// Quiet time when the game starts, before the first possible visit
const FIRST_REST = 40
const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _target = new THREE.Vector3()
const _euler = new THREE.Euler()

function createDolphin() {
    const dolphin = new THREE.Group()
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), gray)
    body.scale.set(0.42, 0.45, 1.6)
    const underside = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), belly)
    underside.scale.set(0.36, 0.3, 1.4)
    underside.position.y = -0.08
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 5), gray)
    beak.rotation.x = Math.PI / 2
    beak.position.set(0, -0.04, 0.95)
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 4), gray)
    fin.scale.z = 0.3
    fin.rotation.x = -0.5
    fin.position.set(0, 0.32, -0.1)
    const flukes = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.04, 0.22), gray)
    flukes.position.z = -0.9
    for (const side of [-1, 1]) {
        const flipper = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.14), gray)
        flipper.position.set(side * 0.25, -0.1, 0.3)
        flipper.rotation.z = side * -0.4
        dolphin.add(flipper)
    }
    dolphin.add(body, underside, beak, fin, flukes)
    mergeByMaterial(dolphin)
    dolphin.scale.setScalar(1.3)
    return dolphin
}

// A pod of dolphins. They roam their own patch of open sea, jumping now and
// then. Sailing fast through open water they may come alongside and porpoise
// next to the boat, splashing every time they dive back in: not every time,
// only by chance, and after a visit they rest for a while.
export class Dolphins {
    constructor({ scene, rand, splash }) {
        this.scene = scene
        this.rand = rand
        this.splash = splash
        this.pod = []
    }

    setup(count, islands, home, { chance = 0.35, rest = 180 } = {}) {
        this.chance = chance
        this.rest = rest
        // visit > 0 while the pod is with you; cooldown counts down between visits
        this.visit = 0
        this.cooldown = FIRST_REST
        this.checkClock = 0
        for (const dolphin of this.pod) dolphin.object.removeFromParent()
        this.pod = []
        this.islands = islands
        this.home = home
        const rand = this.rand
        for (let i = 0; i < count; i++) {
            const object = createDolphin()
            const position = new THREE.Vector3(home.x + (rand() - 0.5) * 10, -0.8, home.z + (rand() - 0.5) * 10)
            object.position.copy(position)
            this.scene.add(object)
            this.pod.push({
                object,
                position,
                velocity: new THREE.Vector3(),
                yaw: rand() * Math.PI * 2,
                jump: rand() * Math.PI * 2,
                wasAbove: false,
                slot: i,
                wander: rand() * Math.PI * 2
            })
        }
    }

    // Decides whether the pod is with you right now
    updateVisit(delta, speed, openWater) {
        if (this.visit > 0) {
            this.visit -= delta
            if (this.visit <= 0) this.cooldown = this.rest * (0.75 + Math.random() * 0.5)
            // While visiting they follow as long as you keep going in open water
            return this.visit > 0 && speed > 3 && openWater
        }
        this.cooldown -= delta
        if (this.cooldown > 0 || speed <= ESCORT_SPEED || !openWater) return false
        this.checkClock += delta
        if (this.checkClock < CHECK_EVERY) return false
        this.checkClock = 0
        if (Math.random() < this.chance) {
            this.visit = VISIT[0] + Math.random() * (VISIT[1] - VISIT[0])
            return true
        }
        // No luck this time: try again a bit later
        this.cooldown = CHECK_EVERY * 2
        return false
    }

    update(delta, time, boat) {
        if (this.pod.length === 0) return
        const boatPosition = boat.mesh.position
        const openWater = shoreDistanceAt(boatPosition.x, boatPosition.z, this.islands) > 12
        const escorting = this.updateVisit(delta, boat.state.speed, openWater)
        _forward.set(0, 0, 1).applyQuaternion(boat.mesh.quaternion).setY(0).normalize()
        _right.set(-_forward.z, 0, _forward.x)

        for (const dolphin of this.pod) {
            // Where it wants to be: beside the bow when escorting, its own circle otherwise
            if (escorting) {
                const side = dolphin.slot % 2 === 0 ? 1 : -1
                const row = Math.floor(dolphin.slot / 2)
                _target.copy(boatPosition)
                    .addScaledVector(_right, side * (3.6 + row * 1.5))
                    .addScaledVector(_forward, 2.5 - row * 3)
            } else {
                dolphin.wander += delta * 0.18
                const radius = 10 + dolphin.slot * 3
                _target.set(this.home.x + Math.cos(dolphin.wander + dolphin.slot) * radius, 0, this.home.z + Math.sin(dolphin.wander + dolphin.slot) * radius)
            }

            // Steer towards it, fast enough to keep up with the boat
            const maxSpeed = escorting ? boat.state.speed * 1.2 + 4 : 5
            const toTarget = _target.sub(dolphin.position).setY(0)
            const distance = toTarget.length()
            const desired = toTarget.multiplyScalar(distance > 0.01 ? Math.min(maxSpeed, distance * 1.5) / distance : 0)
            dolphin.velocity.lerp(desired, 1 - Math.exp(-delta * 2))
            dolphin.position.addScaledVector(dolphin.velocity, delta)
            const speed = dolphin.velocity.length()
            if (speed > 0.3) dolphin.yaw = Math.atan2(dolphin.velocity.x, dolphin.velocity.z)

            // Porpoising: arcs in and out of the water, more often when fast
            dolphin.jump += delta * (escorting ? 2.4 : 0.9)
            const arc = Math.sin(dolphin.jump)
            const water = waveHeight(dolphin.position.x, dolphin.position.z, time)
            const height = escorting ? 1.6 : 1.1
            const y = water - 0.9 + Math.max(0, arc) * height + Math.min(0, arc) * 0.4
            const above = y > water
            // Splash when it leaves and re-enters the water
            if (above !== dolphin.wasAbove) this.splash(dolphin.position.x, water, dolphin.position.z, above ? 8 : 14, escorting ? 1 : 0.7)
            dolphin.wasAbove = above
            // Nose follows the arc
            const pitch = -Math.cos(dolphin.jump) * (arc > 0 ? 0.7 : 0.2)

            dolphin.object.position.set(dolphin.position.x, y, dolphin.position.z)
            dolphin.object.quaternion.setFromEuler(_euler.set(pitch, dolphin.yaw, 0, 'YXZ'))
        }
    }
}
