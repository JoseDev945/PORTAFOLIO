import * as THREE from 'three/webgpu'
import { colorMaterial, glowMaterial, shadow } from '../materials.js'

export default {
    description: 'Faro de rayas',
    schema: {
        height: { type: 'number', default: 9, min: 4, max: 30 },
        stripes: { type: 'number', default: 4, min: 1, max: 12, integer: true },
        color: { type: 'color', default: '#d94b3d' }
    },
    create({ params, materials }) {
        const group = new THREE.Group()
        const { height, stripes } = params
        const segment = height / (stripes * 2)

        // Alternating stripes, slightly narrower towards the top
        for (let i = 0; i < stripes * 2; i++) {
            const bottom = 1.4 - (i / (stripes * 2)) * 0.5
            const top = 1.4 - ((i + 1) / (stripes * 2)) * 0.5
            const ring = shadow(new THREE.Mesh(
                new THREE.CylinderGeometry(top, bottom, segment, 12),
                i % 2 === 0 ? colorMaterial(params.color) : materials.white
            ))
            ring.position.y = segment * (i + 0.5)
            group.add(ring)
        }

        const balcony = shadow(new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.25, 12), materials.darkWood))
        balcony.position.y = height + 0.1
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 8), materials.lamp)
        lamp.position.y = height + 0.75
        const roof = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.9, 8), colorMaterial(params.color)))
        roof.position.y = height + 1.7
        const glow = new THREE.Sprite(glowMaterial)
        glow.scale.setScalar(7)
        glow.position.y = height + 0.75

        group.add(balcony, lamp, roof, glow)
        return {
            object: group,
            colliders: [{ shape: 'cylinder', radius: 1.4, halfHeight: height / 2, position: [0, height / 2, 0] }]
        }
    }
}
