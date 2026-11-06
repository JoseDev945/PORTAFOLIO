import * as THREE from 'three/webgpu'
import { createHullGeometry } from '../../Boat/BoatMesh.js'
import { colorMaterial, shadow } from '../materials.js'

// One station of the fiberglass production line. Built along local +z (bow).
//   mold      empty female mold, waxed and ready
//   gelcoat   mold with the gelcoat layer sprayed in (the outer finish of the boat)
//   laminate  fiberglass mat being laid and wetted with resin over the gelcoat
//   hull      the finished hull out of the mold, on a cradle, waiting for its deck
export default {
    description: 'Molde de casco por etapas (mold, gelcoat, laminate, hull)',
    schema: {
        stage: { type: 'enum', values: ['mold', 'gelcoat', 'laminate', 'hull'], default: 'mold' },
        moldColor: { type: 'color', default: '#d0662a' },
        hullColor: { type: 'color', default: '#f7f5ef' }
    },
    create({ params, materials }) {
        const group = new THREE.Group()
        const add = (mesh, castShadow = true) => {
            if (castShadow) shadow(mesh)
            group.add(mesh)
            return mesh
        }

        if (params.stage === 'hull') {
            // Wooden cradle blocks
            for (const z of [-1.4, 1]) {
                const block = add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 0.35), materials.wood))
                block.position.set(0, 0.45, z)
            }
            const hull = add(new THREE.Mesh(createHullGeometry(1, 1.1), colorMaterial(params.hullColor)))
            hull.position.y = 0.6
            // Open hull, no deck yet: rough laminate visible inside.
            // Sits just above the hull top (1.7): coplanar faces would flicker
            const inside = add(new THREE.Mesh(createHullGeometry(0.9, 0.04), colorMaterial('#d9dccf')), false)
            inside.position.y = 1.71
            return {
                object: group,
                colliders: [{ shape: 'cuboid', size: [1.2, 0.9, 2.7], position: [0, 0.9, 0] }]
            }
        }

        // Steel stand
        const legGeometry = new THREE.BoxGeometry(0.14, 0.6, 0.14)
        for (const x of [-1, 1]) {
            for (const z of [-2, 1.6]) {
                const leg = add(new THREE.Mesh(legGeometry, materials.steel))
                leg.position.set(x, 0.3, z)
            }
            const rail = add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 4), materials.steel))
            rail.position.set(x, 0.55, -0.2)
        }

        // Female mold: thick shell + flange around the rim
        const moldMaterial = colorMaterial(params.moldColor)
        const mold = add(new THREE.Mesh(createHullGeometry(1.12, 1.2), moldMaterial))
        mold.position.y = 0.6
        // Mold top is at 1.8; the flange ends exactly there (same material, no flicker)
        const flange = add(new THREE.Mesh(createHullGeometry(1.3, 0.08), moldMaterial))
        flange.position.y = 1.72

        // What is inside the mold depends on the stage
        const fill = {
            mold: colorMaterial('#3b2a22'),
            gelcoat: colorMaterial(params.hullColor),
            laminate: materials.fiberglass
        }[params.stage]
        // Clearly above the rim (1.8): two surfaces at the same height make the
        // GPU alternate between them every frame (z-fighting)
        const inside = add(new THREE.Mesh(createHullGeometry(1.0, 0.04), fill), false)
        inside.position.y = 1.81

        if (params.stage === 'laminate') {
            // Sheets of mat draped over the rim, still dry at the ends
            const sheetGeometry = new THREE.BoxGeometry(0.9, 0.03, 1.1)
            for (const [x, z, angle] of [[-1.05, -1, 0.5], [1.05, 0.2, -0.5], [-1.05, 1.1, 0.45]]) {
                const sheet = add(new THREE.Mesh(sheetGeometry, materials.fiberglass), false)
                sheet.position.set(x, 1.7, z)
                sheet.rotation.z = angle
            }
            // Resin bucket on the floor
            const bucket = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.4, 8), colorMaterial('#e3b23c')))
            bucket.position.set(1.6, 0.2, -1.8)
        }

        return {
            object: group,
            colliders: [{ shape: 'cuboid', size: [1.4, 0.9, 3], position: [0, 0.9, 0] }]
        }
    }
}
