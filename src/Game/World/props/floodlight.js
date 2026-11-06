import * as THREE from 'three/webgpu'
import { uv, color, smoothstep, float } from 'three/tsl'
import { glowMaterial, shadow } from '../materials.js'
import { shared } from '../shared.js'

// Warm pool of light on the ground under the lamp, only at night. Additive and
// unlit: it brightens whatever is below without a real (expensive) light.
const poolMaterial = (() => {
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    const distance = uv().sub(0.5).length().mul(2)
    const falloff = float(1).sub(smoothstep(0, 1, distance)).pow(1.6)
    material.colorNode = color('#ffb35c').mul(falloff).mul(shared.night).mul(0.5)
    return material
})()

export default {
    description: 'Reflector alto que ilumina el suelo de noche',
    schema: {
        height: { type: 'number', default: 6, min: 2, max: 15 },
        // Radius of the lit circle on the ground (0 = none)
        reach: { type: 'number', default: 7, min: 0, max: 20 },
        // Height of the ground surface above the prop's origin (0.2 on islands)
        ground: { type: 'number', default: 0.2, min: -2, max: 5 }
    },
    create({ params, materials }) {
        const group = new THREE.Group()
        const { height, reach, ground } = params

        const pole = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, height, 6), materials.steel))
        pole.position.y = height / 2
        const arm = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.9), materials.steel))
        arm.position.set(0, height - 0.05, 0.4)
        const head = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.45), materials.rubber))
        head.position.set(0, height - 0.15, 0.8)
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.36), materials.lamp)
        lamp.position.set(0, height - 0.26, 0.8)
        const glow = new THREE.Sprite(glowMaterial)
        glow.scale.setScalar(4.5)
        glow.position.set(0, height - 0.4, 0.8)
        group.add(pole, arm, head, lamp, glow)

        if (reach > 0) {
            const pool = new THREE.Mesh(new THREE.CircleGeometry(reach, 24), poolMaterial)
            pool.rotation.x = -Math.PI / 2
            pool.position.set(0, ground + 0.03, 0.8)
            // Not merged with the island: merged meshes cast shadows, this must not
            pool.userData.keep = true
            group.add(pool)
        }

        return {
            object: group,
            colliders: [{ shape: 'cylinder', radius: 0.18, halfHeight: height / 2, position: [0, height / 2, 0] }]
        }
    }
}
