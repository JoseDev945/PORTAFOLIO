import * as THREE from 'three/webgpu'
import { random } from '../utils/random.js'

const COUNT = 9

// Seagulls circling over the islands, flapping now and then and gliding the
// rest of the time. They fly below the camera so they're actually visible.
export class Birds {
    constructor({ scene }) {
        this.rand = random(11)
        const white = new THREE.MeshLambertMaterial({ color: '#f7f7f2', flatShading: true })
        const gray = new THREE.MeshLambertMaterial({ color: '#8d99a6', flatShading: true, side: THREE.DoubleSide })
        const beak = new THREE.MeshLambertMaterial({ color: '#f2b134', flatShading: true })

        // One wing: a thin triangle pointing outwards along +x
        const wingShape = new THREE.Shape()
        wingShape.moveTo(0, -0.18)
        wingShape.lineTo(0.95, 0.05)
        wingShape.lineTo(0, 0.22)
        wingShape.closePath()
        const wingGeometry = new THREE.ShapeGeometry(wingShape)
        wingGeometry.rotateX(-Math.PI / 2)

        this.birds = []
        for (let i = 0; i < COUNT; i++) {
            const bird = new THREE.Group()
            const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 5), white)
            body.rotation.x = Math.PI / 2
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), beak)
            tip.rotation.x = Math.PI / 2
            tip.position.z = 0.46
            const left = new THREE.Mesh(wingGeometry, gray)
            const right = new THREE.Mesh(wingGeometry, gray)
            right.scale.x = -1
            left.position.z = right.position.z = 0.05
            bird.add(body, tip, left, right)
            bird.scale.setScalar(1.4)
            scene.add(bird)
            this.birds.push({
                object: bird,
                left,
                right,
                // Circle center (re-picked around the view from time to time), radius, speed, height
                center: new THREE.Vector2(),
                radius: 8 + this.rand() * 14,
                angle: this.rand() * Math.PI * 2,
                speed: (0.25 + this.rand() * 0.2) * (this.rand() < 0.5 ? -1 : 1),
                height: 9 + this.rand() * 6,
                phase: this.rand() * 10,
                placed: false
            })
        }
    }

    update(delta, time, focus) {
        for (const bird of this.birds) {
            // Keep the flock around the camera target: reposition gulls that drift too far
            if (!bird.placed || Math.hypot(bird.center.x - focus.x, bird.center.y - focus.z) > 70) {
                bird.center.set(focus.x + (this.rand() - 0.5) * 80, focus.z + (this.rand() - 0.5) * 80)
                bird.placed = true
            }
            bird.angle += bird.speed * delta
            const x = bird.center.x + Math.cos(bird.angle) * bird.radius
            const z = bird.center.y + Math.sin(bird.angle) * bird.radius
            const y = bird.height + Math.sin(time * 0.7 + bird.phase) * 0.6
            const { object } = bird
            // Face the direction of travel (tangent of the circle)
            const heading = Math.atan2(-Math.sin(bird.angle) * Math.sign(bird.speed), Math.cos(bird.angle) * Math.sign(bird.speed))
            object.position.set(x, y, z)
            object.rotation.set(0, heading, -Math.sign(bird.speed) * 0.25)

            // Flap in bursts, glide in between
            const burst = Math.max(0, Math.sin(time * 0.5 + bird.phase))
            const flap = Math.sin(time * 9 + bird.phase) * 0.6 * burst + 0.12
            bird.left.rotation.z = flap
            bird.right.rotation.z = -flap
        }
    }
}
