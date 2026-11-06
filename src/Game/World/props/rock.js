import * as THREE from 'three/webgpu'
import { shadow } from '../materials.js'

export default {
    description: 'Roca',
    schema: {
        // 0 = random size between 0.6 and 1.5
        size: { type: 'number', default: 0, min: 0, max: 20 }
    },
    create({ params, rand, materials }) {
        const size = params.size || 0.6 + rand() * 0.9
        const geometry = new THREE.DodecahedronGeometry(size, 0)
        geometry.scale(1, 0.7 + rand() * 0.5, 1)
        const rock = shadow(new THREE.Mesh(geometry, materials.rock))
        rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI)

        const group = new THREE.Group()
        group.add(rock)
        return {
            object: group,
            colliders: [{ shape: 'ball', radius: size * 0.85 }]
        }
    }
}
