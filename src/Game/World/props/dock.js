import * as THREE from 'three/webgpu'
import { shadow } from '../materials.js'
import lantern from './lantern.js'

// Wooden pier. Built along its local +Z axis, starting at its position.
export default {
    description: 'Muelle de madera',
    schema: {
        length: { type: 'number', default: 7, min: 2, max: 40 },
        width: { type: 'number', default: 2.4, min: 1, max: 8 },
        lantern: { type: 'boolean', default: true }
    },
    create({ params, rand, materials }) {
        const group = new THREE.Group()
        const { length, width } = params

        const plankGeometry = new THREE.BoxGeometry(width, 0.15, 0.42)
        const plankCount = Math.max(1, Math.round(length / 0.5))
        for (let i = 0; i < plankCount; i++) {
            const plank = shadow(new THREE.Mesh(plankGeometry, materials.wood))
            plank.position.set((rand() - 0.5) * 0.1, 0.9, i * 0.5 + 0.25)
            plank.rotation.y = (rand() - 0.5) * 0.06
            group.add(plank)
        }

        const postGeometry = new THREE.CylinderGeometry(0.18, 0.2, 3, 6)
        const postCount = Math.max(2, Math.round(length / 2.3))
        for (const side of [-1, 1]) {
            for (let i = 0; i < postCount; i++) {
                const post = shadow(new THREE.Mesh(postGeometry, materials.darkWood))
                post.position.set(side * (width / 2 + 0.05), 0, 2.5 + ((length - 2.7) * i) / (postCount - 1))
                group.add(post)
            }
        }

        if (params.lantern) {
            const light = lantern.create({ params: { height: 2.2 }, materials }).object
            light.position.set(width / 2 - 0.1, 1, length - 0.6)
            group.add(light)
        }

        return {
            object: group,
            colliders: [{ shape: 'cuboid', size: [width / 2 + 0.2, 1.5, length / 2], position: [0, 0, length / 2] }]
        }
    }
}
