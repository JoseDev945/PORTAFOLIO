import * as THREE from 'three/webgpu'
import { createBoatMesh, resolveBoat } from '../../Boat/BoatMesh.js'
import { mergeByMaterial } from '../../utils/merge.js'
import { colorMaterial, shadow } from '../materials.js'
import { createLabel } from '../Label.js'
import dock from './dock.js'

// Showroom spot: a boat model turning slowly on a platform over the water,
// with its name above and a zone in front. Sailing into the zone shows the
// boat's card and lets the player switch to it.
// Built facing local +z: the pier goes back (-z) to the shore, the zone is ahead.
export default {
    description: 'Exhibición de un bote para cambiar de modelo',
    animated: true,
    schema: {
        model: { type: 'string', default: 'lancha' },
        accent: { type: 'color', default: '#2f6db5' },
        pier: { type: 'number', default: 3, min: 0, max: 20 }
    },
    create({ params, rand, materials, content, warn }) {
        const group = new THREE.Group()
        const definition = resolveBoat(content.boats, params.model, 'model', warn)
        const radius = Math.max(3, definition.size.length / 2 + 0.4)

        // Static part: platform on piles + walkway to the shore, merged
        const structure = new THREE.Group()
        group.add(structure)
        const platform = shadow(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.35, 20), materials.wood))
        platform.position.y = 0.85
        const rim = shadow(new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.12, radius + 0.12, 0.2, 20), colorMaterial(params.accent)))
        rim.position.y = 0.72
        structure.add(platform, rim)
        const pileGeometry = new THREE.CylinderGeometry(0.2, 0.22, 3, 6)
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2
            const pile = shadow(new THREE.Mesh(pileGeometry, materials.darkWood))
            pile.position.set(Math.cos(angle) * (radius - 0.4), -0.6, Math.sin(angle) * (radius - 0.4))
            structure.add(pile)
        }
        if (params.pier > 0) {
            const walkway = dock.create({ params: { length: params.pier, width: 1.6, lantern: false }, rand, materials }).object
            walkway.rotation.y = Math.PI
            walkway.position.z = -radius + 0.3
            structure.add(walkway)
        }
        mergeByMaterial(structure)

        // Turntable with the boat on blocks
        const turntable = new THREE.Group()
        turntable.position.y = 1.02
        group.add(turntable)
        for (const z of [-1.3, 1.1]) {
            const block = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.35), materials.darkWood))
            block.position.set(0, 0.15, z)
            turntable.add(block)
        }
        const boat = createBoatMesh(definition)
        boat.position.y = 0.3 + definition.size.height * 0.55
        turntable.add(boat)

        const label = createLabel(definition.name, params.accent)
        label.scale.set(9, 2.25, 1)
        label.position.y = 6.5
        group.add(label)

        const phase = rand() * Math.PI * 2
        return {
            object: group,
            colliders: [
                // Platform + the boat on it
                { shape: 'cylinder', radius: radius + 0.15, halfHeight: 3.2, position: [0, 0, 0] },
                ...(params.pier > 0 ? [{ shape: 'cuboid', size: [0.9, 1.5, params.pier / 2], position: [0, 0, -radius - params.pier / 2] }] : [])
            ],
            zones: [{
                position: [0, 0, radius + 4.5],
                radius: 3.5,
                accent: params.accent,
                payload: { type: 'boat', id: definition.id, definition }
            }],
            update(time) {
                turntable.rotation.y = time * 0.25 + phase
                label.position.y = 6.5 + Math.sin(time * 1.4 + phase) * 0.2
            }
        }
    }
}
