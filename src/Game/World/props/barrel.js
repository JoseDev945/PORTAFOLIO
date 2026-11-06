import * as THREE from 'three/webgpu'
import { colorMaterial, shadow } from '../materials.js'

export default {
    description: 'Barril (física: flota, rueda y se puede empujar)',
    body: { type: 'dynamic', mass: 1.5, floatDepth: 0.1 },
    schema: {
        color: { type: 'color', default: '#8b5e3c' }
    },
    create({ params, materials }) {
        const group = new THREE.Group()
        const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10), colorMaterial(params.color)))
        body.position.y = 0.55
        const ringGeometry = new THREE.CylinderGeometry(0.45, 0.45, 0.08, 10)
        for (const y of [0.2, 0.9]) {
            const ring = shadow(new THREE.Mesh(ringGeometry, materials.darkWood))
            ring.position.y = y
            group.add(ring)
        }
        group.add(body)
        return {
            object: group,
            colliders: [{ shape: 'cylinder', radius: 0.45, halfHeight: 0.55, position: [0, 0.55, 0] }]
        }
    }
}
