import * as THREE from 'three/webgpu'
import { glowMaterial, shadow } from '../materials.js'

export default {
    description: 'Farol con luz',
    schema: {
        height: { type: 'number', default: 2.2, min: 0.5, max: 10 }
    },
    create({ params, materials }) {
        const group = new THREE.Group()
        const { height } = params

        const post = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.16, height, 0.16), materials.darkWood))
        post.position.y = height / 2
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.45), materials.lamp)
        lamp.position.y = height + 0.2
        const roof = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.35, 4), materials.darkWood))
        roof.position.y = height + 0.65
        roof.rotation.y = Math.PI / 4

        const glow = new THREE.Sprite(glowMaterial)
        glow.scale.setScalar(2.8)
        glow.position.y = height + 0.2

        group.add(post, lamp, roof, glow)
        return {
            object: group,
            colliders: [{ shape: 'cuboid', size: [0.15, height / 2, 0.15], position: [0, height / 2, 0] }]
        }
    }
}
