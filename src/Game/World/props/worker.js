import * as THREE from 'three/webgpu'
import { colorMaterial, mistMaterial, shadow } from '../materials.js'
import { mergeByMaterial } from '../../utils/merge.js'

const MIST_COUNT = 12

// Shipyard worker in white coveralls and respirator, facing local +z.
//   roll    rolling resin into the fiberglass with a roller
//   spray   spraying gelcoat into a mold (with mist)
//   sand    sanding a hull
//   idle    standing
export default {
    description: 'Operario animado (roll, spray, sand, idle)',
    animated: true,
    schema: {
        action: { type: 'enum', values: ['roll', 'spray', 'sand', 'idle'], default: 'roll' },
        suitColor: { type: 'color', default: '#f2f2f2' },
        // Animation offset so several workers don't move in sync
        phase: { type: 'number', default: 0 }
    },
    create({ params, materials, rand }) {
        const group = new THREE.Group()
        const suit = colorMaterial(params.suitColor)
        const add = (parent, mesh) => {
            parent.add(shadow(mesh))
            return mesh
        }

        const body = new THREE.Group()
        group.add(body)
        for (const x of [-0.12, 0.12]) {
            const leg = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.8, 0.2), suit))
            leg.position.set(x, 0.4, 0)
            // Dark rubber boots
            const boot = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.28), materials.rubber))
            boot.position.set(x, 0.1, 0.03)
        }
        const torso = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3), suit))
        torso.position.y = 1.13
        const head = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), materials.skin))
        head.position.y = 1.62
        const hood = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.175, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), suit))
        hood.position.y = 1.64
        const mask = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.1), materials.mask))
        mask.position.set(0, 1.56, 0.15)

        // Both arms hold the tool together, pivoting at the shoulders
        const arms = new THREE.Group()
        arms.position.y = 1.38
        body.add(arms)
        for (const x of [-0.2, 0.2]) {
            const arm = add(arms, new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), suit))
            arm.position.set(x, 0, 0.3)
            // Chemical resistant gloves
            const glove = add(arms, new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.14), colorMaterial('#2e7d32')))
            glove.position.set(x, 0, 0.62)
        }

        let tip = new THREE.Vector3(0, 0, 0.7)
        if (params.action === 'roll') {
            const handle = add(arms, new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), colorMaterial('#e3b23c')))
            handle.rotation.x = Math.PI / 2
            handle.position.set(0, 0, 1)
            const roller = add(arms, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), colorMaterial('#9e9e9e')))
            roller.rotation.z = Math.PI / 2
            roller.position.set(0, 0, 1.5)
        } else if (params.action === 'spray') {
            const gun = add(arms, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.3), colorMaterial('#3e7cb1')))
            gun.position.set(0.1, 0, 0.7)
            const nozzle = add(arms, new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.2, 6), materials.steel))
            nozzle.rotation.x = Math.PI / 2
            nozzle.position.set(0.1, 0.02, 0.92)
            tip = new THREE.Vector3(0.1, 0.02, 1)
        } else if (params.action === 'sand') {
            const sander = add(arms, new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.2), colorMaterial('#d35400')))
            sander.position.set(0, 0, 0.72)
        }

        // Spray mist: puffs leaving the nozzle, growing and fading
        const mist = []
        if (params.action === 'spray') {
            for (let i = 0; i < MIST_COUNT; i++) {
                const puff = new THREE.Sprite(mistMaterial)
                puff.userData = { offset: i / MIST_COUNT, spread: new THREE.Vector2(rand() - 0.5, rand() - 0.5) }
                arms.add(puff)
                mist.push(puff)
            }
        }

        // Fewer draw calls: bake the arms (with tool) and the rest of the body
        // separately, since they move independently
        mergeByMaterial(arms)
        arms.userData.keep = true
        mergeByMaterial(body)

        const phase = params.phase + rand() * 10
        return {
            object: group,
            colliders: [{ shape: 'cylinder', radius: 0.3, halfHeight: 0.9, position: [0, 0.9, 0] }],
            update(time) {
                const t = time + phase
                body.position.y = Math.sin(t * 2) * 0.01
                switch (params.action) {
                    case 'roll':
                        // Long strokes into the mold
                        arms.rotation.x = 0.55 + Math.sin(t * 2.6) * 0.3
                        body.rotation.x = 0.12 + Math.sin(t * 2.6) * 0.06
                        break
                    case 'spray':
                        // Slow sweeps along the mold
                        arms.rotation.x = 0.35
                        arms.rotation.y = Math.sin(t * 0.9) * 0.45
                        break
                    case 'sand':
                        arms.rotation.x = 0.25 + Math.sin(t * 1.3) * 0.15
                        arms.rotation.y = Math.sin(t * 14) * 0.08
                        break
                    default:
                        arms.rotation.x = 1.2
                }

                for (const puff of mist) {
                    const progress = (t * 0.9 + puff.userData.offset) % 1
                    const { spread } = puff.userData
                    puff.position.set(
                        tip.x + spread.x * progress * 0.8,
                        tip.y + spread.y * progress * 0.5 - progress * 0.3,
                        tip.z + progress * 1.3
                    )
                    puff.scale.setScalar((0.12 + progress * 0.7) * (1 - progress * progress))
                }
            }
        }
    }
}
