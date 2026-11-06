import * as THREE from 'three/webgpu'
import { colorMaterial, shadow } from '../materials.js'

// Big, light beach ball: bounces off the boat and floats high on the water
export default {
    description: 'Pelota de playa (física: ligera y rebota)',
    body: { type: 'dynamic', mass: 0.3, floatDepth: 0.05, restitution: 0.8, friction: 0.3 },
    schema: {
        radius: { type: 'number', default: 0.7, min: 0.2, max: 4 },
        color: { type: 'color', default: '#e63946' }
    },
    create({ params, materials }) {
        const group = new THREE.Group()
        const { radius } = params
        // Colored and white segments, like a real beach ball
        const segments = 6
        for (let i = 0; i < segments; i++) {
            const geometry = new THREE.SphereGeometry(radius, 4, 10, (i / segments) * Math.PI * 2, (Math.PI * 2) / segments)
            const segment = shadow(new THREE.Mesh(geometry, i % 2 === 0 ? colorMaterial(params.color) : materials.white))
            segment.position.y = radius
            group.add(segment)
        }
        return {
            object: group,
            colliders: [{ shape: 'ball', radius, position: [0, radius, 0] }]
        }
    }
}
