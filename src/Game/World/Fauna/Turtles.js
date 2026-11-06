import * as THREE from 'three/webgpu'
import { mergeByMaterial } from '../../utils/merge.js'
import { seabedDepth } from '../Water.js'

const shell = new THREE.MeshLambertMaterial({ color: '#5a7a3a', flatShading: true })
const skin = new THREE.MeshLambertMaterial({ color: '#9bb06a', flatShading: true })

const _up = new THREE.Vector3(0, 1, 0)

function createTurtle() {
    const turtle = new THREE.Group()
    const body = new THREE.Group()
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), shell)
    dome.scale.set(0.85, 0.45, 1.05)
    const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 7), skin)
    belly.scale.z = 1.25
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), skin)
    head.position.set(0, 0.04, 0.62)
    body.add(dome, belly, head)
    mergeByMaterial(body, { castShadow: false, receiveShadow: false })
    turtle.add(body)

    // Flippers pivot at the shell edge so they can row
    const flippers = []
    for (const [x, z, length] of [[-0.4, 0.3, 0.55], [0.4, 0.3, 0.55], [-0.32, -0.42, 0.3], [0.32, -0.42, 0.3]]) {
        const pivot = new THREE.Group()
        pivot.position.set(x, 0.02, z)
        const flipper = new THREE.Mesh(new THREE.BoxGeometry(length, 0.04, 0.2), skin)
        flipper.position.x = Math.sign(x) * length / 2
        flipper.rotation.y = Math.sign(x) * -0.35
        pivot.add(flipper)
        turtle.add(pivot)
        flippers.push({ pivot, side: Math.sign(x), front: z > 0 })
    }
    turtle.scale.setScalar(1.6)
    return { object: turtle, flippers }
}

// Sea turtles gliding slowly in wide circles around the islands, rowing with
// their front flippers and coming up to breathe now and then
export class Turtles {
    constructor({ scene, rand }) {
        this.scene = scene
        this.rand = rand
        this.turtles = []
    }

    setup(count, islands) {
        for (const turtle of this.turtles) turtle.object.removeFromParent()
        this.turtles = []
        this.islands = islands
        if (islands.length === 0) return
        const rand = this.rand
        for (let i = 0; i < count; i++) {
            const turtle = createTurtle()
            const home = islands[(i * 2 + 1) % islands.length]
            Object.assign(turtle, {
                home,
                orbit: home.radius + 10 + rand() * 10,
                angle: rand() * Math.PI * 2,
                speed: (0.035 + rand() * 0.025) * (rand() < 0.5 ? -1 : 1),
                phase: rand() * 100
            })
            this.scene.add(turtle.object)
            this.turtles.push(turtle)
        }
    }

    update(delta, time) {
        for (const turtle of this.turtles) {
            turtle.angle += turtle.speed * delta
            const x = turtle.home.x + Math.cos(turtle.angle) * turtle.orbit
            const z = turtle.home.z + Math.sin(turtle.angle) * turtle.orbit
            // Mostly near the bottom, rising to the surface to breathe every minute or so
            const floor = Math.min(seabedDepth(x, z, this.islands) - 0.8, 4)
            const breathe = Math.pow(Math.max(0, Math.sin(time * 0.1 + turtle.phase)), 6)
            const y = -THREE.MathUtils.lerp(floor, 0.35, breathe)
            const heading = Math.atan2(-Math.sin(turtle.angle) * Math.sign(turtle.speed), Math.cos(turtle.angle) * Math.sign(turtle.speed))
            turtle.object.position.set(x, y, z)
            turtle.object.quaternion.setFromAxisAngle(_up, heading)
            turtle.object.rotateX(-breathe * 0.25)

            const stroke = Math.sin(time * 1.6 + turtle.phase)
            for (const { pivot, side, front } of turtle.flippers) {
                pivot.rotation.z = side * (front ? stroke * 0.6 : stroke * 0.25)
                pivot.rotation.y = front ? side * stroke * 0.3 : 0
            }
        }
    }
}
