import * as THREE from 'three/webgpu'
import { colorMaterial, shadow } from '../materials.js'

export default {
    description: 'Caja de madera (física: flota y se puede empujar)',
    body: { type: 'dynamic', mass: 1.2, floatDepth: 0.08 },
    schema: {
        size: { type: 'number', default: 0.8, min: 0.2, max: 5 },
        color: { type: 'color', default: '#b07a4a' }
    },
    create({ params, materials }) {
        const group = new THREE.Group()
        const { size } = params
        const box = shadow(new THREE.Mesh(new THREE.BoxGeometry(size, size, size), colorMaterial(params.color)))
        box.position.y = size / 2
        // Darker frame on the edges
        const barGeometry = new THREE.BoxGeometry(size * 1.02, size * 0.12, size * 1.02)
        for (const y of [0.08, 0.92]) {
            const bar = shadow(new THREE.Mesh(barGeometry, materials.darkWood))
            bar.position.y = size * y
            group.add(bar)
        }
        group.add(box)
        return {
            object: group,
            colliders: [{ shape: 'cuboid', size: [size / 2, size / 2, size / 2], position: [0, size / 2, 0] }],
            // Heavier when bigger
            body: { mass: 1.2 * (size / 0.8) ** 3 }
        }
    }
}
