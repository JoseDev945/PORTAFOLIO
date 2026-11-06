import * as THREE from 'three/webgpu'
import { colorMaterial, shadow } from '../materials.js'

// Stacked rolls of fiberglass mat on a pallet
export default {
    description: 'Rollos de fibra de vidrio en pallet',
    schema: {
        count: { type: 'number', default: 3, min: 1, max: 6, integer: true }
    },
    create({ params, materials }) {
        const group = new THREE.Group()
        const pallet = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.15, 1.3), materials.wood))
        pallet.position.y = 0.08
        group.add(pallet)

        const rollGeometry = new THREE.CylinderGeometry(0.22, 0.22, 1.2, 10)
        const coreGeometry = new THREE.CylinderGeometry(0.08, 0.08, 1.22, 6)
        const roll = colorMaterial('#f1f4ec')
        const core = colorMaterial('#a1887f')
        // Pyramid stack: 2 at the bottom, then 1 on top, ...
        let placed = 0
        for (let row = 0; placed < params.count; row++) {
            const inRow = Math.max(1, 2 - row)
            for (let i = 0; i < inRow && placed < params.count; i++, placed++) {
                const x = inRow === 1 ? 0 : (i - 0.5) * 0.46
                for (const [geometry, material] of [[rollGeometry, roll], [coreGeometry, core]]) {
                    const mesh = shadow(new THREE.Mesh(geometry, material))
                    mesh.rotation.z = Math.PI / 2
                    mesh.rotation.y = Math.PI / 2
                    mesh.position.set(x, 0.38 + row * 0.4, 0)
                    group.add(mesh)
                }
            }
        }
        return {
            object: group,
            colliders: [{ shape: 'cuboid', size: [0.65, 0.5, 0.65], position: [0, 0.5, 0] }]
        }
    }
}
