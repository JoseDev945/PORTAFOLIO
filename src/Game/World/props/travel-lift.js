import * as THREE from 'three/webgpu'
import { createBoatMesh, resolveBoat } from '../../Boat/BoatMesh.js'
import { shadow } from '../materials.js'
import { mergeByMaterial } from '../../utils/merge.js'
import { waveHeight } from '../Waves.js'
import dock from './dock.js'

const smooth = (t) => t * t * (3 - 2 * t)

// Travel lift: a blue gantry crane on two piers that lifts boats out of the
// water and lowers them back in on slings. Piers run along local +z from the
// shore; the crane sits near their end, over the water.
export default {
    description: 'Grúa pórtico que baja y sube un bote al agua',
    animated: true,
    schema: {
        length: { type: 'number', default: 10, min: 6, max: 30 },
        model: { type: 'string', default: 'lancha' },
        // Seconds for a full cycle (lift, hold, lower, hold)
        cycle: { type: 'number', default: 22, min: 6, max: 120 }
    },
    create({ params, rand, materials, content, warn }) {
        const group = new THREE.Group()
        const { length } = params
        const span = 2.4
        const center = length - 3.2
        const deckY = 0.9
        const height = 5.5
        const topY = deckY + height

        // Static structure (piers + gantry) is merged into a few meshes; the
        // animated part (boat + slings) lives in `frame`
        const structure = new THREE.Group()
        group.add(structure)
        const frame = new THREE.Group()
        frame.position.z = center
        group.add(frame)

        // Two narrow piers forming the slip
        for (const side of [-1, 1]) {
            const pier = dock.create({ params: { length, width: 1.3, lantern: false }, rand, materials }).object
            pier.position.x = side * span
            structure.add(pier)
        }

        // Gantry: four posts on wheels, cross beams and side beams
        const gantry = new THREE.Group()
        gantry.position.z = center
        structure.add(gantry)
        const add = (mesh) => gantry.add(shadow(mesh))
        for (const x of [-span, span]) {
            for (const z of [-1.9, 1.9]) {
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, height, 0.3), materials.liftBlue)
                post.position.set(x, deckY + height / 2 + 0.35, z)
                add(post)
                const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.46, 10), materials.rubber)
                wheel.rotation.z = Math.PI / 2
                wheel.position.set(x, deckY + 0.35, z)
                add(wheel)
            }
            const side = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 4.2), materials.liftBlue)
            side.position.set(x, topY + 0.35, 0)
            add(side)
        }
        for (const z of [-1.9, 1.9]) {
            const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 0.3, 0.45, 0.35), materials.liftBlue)
            beam.position.set(0, topY + 0.6, z)
            add(beam)
        }
        const engine = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 1.2), materials.steel)
        engine.position.set(span + 0.55, deckY + 1.6, 0)
        add(engine)
        mergeByMaterial(structure)

        // The boat hanging in the slings
        const definition = resolveBoat(content.boats, params.model, 'model', warn)
        const boat = createBoatMesh(definition)
        frame.add(boat)
        const bottomOffset = definition.size.height * 0.55

        // Slings: two vertical straps per side + one under the hull, per cross beam
        const strapMaterial = materials.rubber
        const straps = []
        for (const z of [-1.3, 1.1]) {
            for (const x of [-1, 1]) {
                const strap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.18), strapMaterial)
                strap.position.set(x * (definition.size.width / 2 + 0.05), 0, z)
                frame.add(strap)
                straps.push(strap)
            }
            const under = new THREE.Mesh(new THREE.BoxGeometry(definition.size.width + 0.2, 0.08, 0.18), strapMaterial)
            under.position.z = z
            frame.add(under)
            straps.push(under)
        }

        const upY = deckY + 1.2 + bottomOffset
        let world = null
        return {
            object: group,
            colliders: [
                // Piers
                ...[-1, 1].map((side) => ({ shape: 'cuboid', size: [0.85, 1.5, length / 2], position: [side * span, 0, length / 2] })),
                // Gantry posts
                ...[-span, span].flatMap((x) => [-1.9, 1.9].map((z) => ({ shape: 'cuboid', size: [0.2, height / 2 + 0.4, 0.2], position: [x, deckY + height / 2, center + z] }))),
                // The boat in the slings, going up and down with them
                { shape: 'cuboid', size: [definition.size.width / 2, definition.size.height * 0.5 + 0.3, definition.size.length / 2], follow: boat }
            ],
            update(time) {
                if (!world) world = boat.getWorldPosition(new THREE.Vector3())
                const waterY = waveHeight(world.x, world.z, time) - 0.15

                // 0-30% in the water, 30-45% lifting, 45-75% up, 75-90% lowering, rest in the water
                const t = (time / params.cycle) % 1
                let up = 0
                if (t > 0.3 && t < 0.45) up = smooth((t - 0.3) / 0.15)
                else if (t >= 0.45 && t < 0.75) up = 1
                else if (t >= 0.75 && t < 0.9) up = 1 - smooth((t - 0.75) / 0.15)

                boat.position.y = THREE.MathUtils.lerp(waterY, upY, up) + Math.sin(time * 1.1) * 0.03 * up
                boat.rotation.z = Math.sin(time * 0.8) * 0.02 * (1 - up)

                const bottom = boat.position.y - bottomOffset
                const strapLength = topY + 0.4 - bottom
                for (const strap of straps) {
                    if (strap.geometry.parameters.height === 1) {
                        strap.scale.y = strapLength
                        strap.position.y = bottom + strapLength / 2
                    } else {
                        strap.position.y = bottom - 0.04
                    }
                }
            }
        }
    }
}
