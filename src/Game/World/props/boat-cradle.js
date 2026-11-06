import * as THREE from 'three/webgpu'
import { createBoatMesh, resolveBoat } from '../../Boat/BoatMesh.js'
import { shadow } from '../materials.js'

// A finished boat on a wooden cradle, ready to go in the water
export default {
    description: 'Bote terminado sobre soporte',
    schema: {
        model: { type: 'string', default: 'lancha' }
    },
    create({ params, content, warn, materials }) {
        const group = new THREE.Group()
        for (const z of [-1.5, 1.2]) {
            const block = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.4), materials.wood))
            block.position.set(0, 0.45, z)
            group.add(block)
        }
        const definition = resolveBoat(content.boats, params.model, 'model', warn)
        const boat = createBoatMesh(definition)
        // The model's origin is at mid hull height
        boat.position.y = 0.7 + definition.size.height / 2
        group.add(boat)
        return {
            object: group,
            colliders: [{ shape: 'cuboid', size: [definition.size.width / 2, 1, definition.size.length / 2], position: [0, 1, 0] }]
        }
    }
}
