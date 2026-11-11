import * as THREE from 'three/webgpu'
import { shadow } from '../materials.js'
import lantern from './lantern.js'

// Top of the planks: where someone on foot stands
export const DECK_TOP = 0.975

// Wooden pier. Built along its local +Z axis, starting at its position.
// You can moor next to it and step off the boat to walk on it (F).
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

        const colliders = [{ shape: 'cuboid', size: [width / 2 + 0.2, 1.5, length / 2], position: [0, 0, length / 2], ground: true }]
        if (params.lantern) {
            const light = lantern.create({ params: { height: 2.2 }, materials }).object
            light.position.set(width / 2 - 0.1, 1, length - 0.6)
            group.add(light)
            colliders.push({ shape: 'cuboid', size: [0.12, 1.1, 0.12], position: [width / 2 - 0.1, 2.1, length - 0.6] })
        }

        return {
            object: group,
            colliders,
            // The planks, reaching a bit back onto the beach so the step off is seamless
            walkable: [{ size: [width / 2, length / 2 + 0.5], position: [0, DECK_TOP, length / 2 - 0.5] }]
        }
    }
}
