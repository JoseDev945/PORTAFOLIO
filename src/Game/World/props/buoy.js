import * as THREE from 'three/webgpu'
import { colorMaterial, shadow } from '../materials.js'

// Floats on the waves and can be pushed; its mooring line pulls it back
export default {
    description: 'Boya anclada (física: flota y se puede empujar)',
    body: { type: 'dynamic', mass: 2, floatDepth: 0.2, anchor: { slack: 1.5 }, restitution: 0.4 },
    schema: {
        color: { type: 'color', default: '#e8483b' },
        light: { type: 'boolean', default: true }
    },
    create({ params, materials }) {
        const group = new THREE.Group()
        const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 1.4, 8), colorMaterial(params.color)))
        body.position.y = 0.3
        const band = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.25, 8), materials.white))
        band.position.y = 0.55
        group.add(body, band)
        if (params.light) {
            const light = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), colorMaterial(params.color, true))
            light.position.y = 1.15
            group.add(light)
        }
        return {
            object: group,
            colliders: [{ shape: 'cylinder', radius: 0.55, halfHeight: 0.7, position: [0, 0.3, 0] }]
        }
    }
}
