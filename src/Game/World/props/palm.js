import * as THREE from 'three/webgpu'
import { shadow } from '../materials.js'

export default {
    description: 'Palmera',
    schema: {
        // 0 = random height between 5 and 7.5
        height: { type: 'number', default: 0, min: 0, max: 20 },
        leaves: { type: 'number', default: 7, min: 3, max: 14, integer: true }
    },
    create({ params, rand, materials }) {
        const group = new THREE.Group()
        const height = params.height || 5 + rand() * 2.5
        const lean = new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize().multiplyScalar(1 + rand() * 1.5)

        const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(lean.x * 0.2, height * 0.5, lean.z * 0.2),
            new THREE.Vector3(lean.x, height, lean.z)
        )
        group.add(shadow(new THREE.Mesh(new THREE.TubeGeometry(curve, 6, 0.22, 6), materials.trunk)))

        const leafGeometry = new THREE.BoxGeometry(0.9, 0.04, 3, 1, 1, 4)
        leafGeometry.translate(0, 0, 1.5)
        const position = leafGeometry.attributes.position
        for (let i = 0; i < position.count; i++) {
            const z = position.getZ(i)
            position.setY(i, position.getY(i) - z * z * 0.12)
            position.setX(i, position.getX(i) * (1 - z / 3.4))
        }
        leafGeometry.computeVertexNormals()

        const top = curve.getPoint(1)
        for (let i = 0; i < params.leaves; i++) {
            const leaf = shadow(new THREE.Mesh(leafGeometry, materials.leaf))
            leaf.position.copy(top)
            leaf.rotation.y = (i / params.leaves) * Math.PI * 2 + rand() * 0.4
            leaf.rotation.x = -0.25 + rand() * 0.3
            group.add(leaf)
        }

        return {
            object: group,
            colliders: [{ shape: 'cylinder', radius: 0.35, halfHeight: height / 2, position: [0, height / 2, 0] }]
        }
    }
}
