import * as THREE from 'three/webgpu'
import { colorMaterial, shadow } from '../materials.js'
import { PLAYER_COLORS } from '../../utils/players.js'
import lantern from './lantern.js'
import { DECK_TOP } from './dock.js'

// The big marina where every player starts. Built along its local +Z axis,
// from the shore: a walkway, a T head across it and finger piers with a berth
// between each pair (one per player, marked with the player's color).
// Boats moor stern to the head, bow out to sea; step off with F and walk.
//
//              shore
//               ||        walkway (stem)
//   ============||============   head
//   |   B0  |   B1  |  B2 ...  |  fingers, a boat between each pair
export default {
    description: 'Marina con amarres para los jugadores',
    schema: {
        stem: { type: 'number', default: 19, min: 2, max: 60 },
        width: { type: 'number', default: 3.2, min: 1.5, max: 8 },
        berths: { type: 'number', default: 5, min: 1, max: 10, integer: true },
        spacing: { type: 'number', default: 7.2, min: 4, max: 20 },
        finger: { type: 'number', default: 9, min: 2, max: 20 }
    },
    create({ params, rand, materials }) {
        const group = new THREE.Group()
        const { stem, width, berths, spacing, finger } = params
        const head = 4
        const fingerWidth = 1.4
        const headWidth = berths * spacing + fingerWidth
        const headZ = stem + head / 2
        const fingerZ = stem + head + finger / 2
        const fingerXs = Array.from({ length: berths + 1 }, (_, i) => (i - berths / 2) * spacing)

        // Planks: boards across each walkway, every 0.5 m
        const boards = (centerX, centerZ, sizeX, sizeZ, alongZ) => {
            const length = alongZ ? sizeZ : sizeX
            const across = alongZ ? sizeX : sizeZ
            const geometry = alongZ ? new THREE.BoxGeometry(across, 0.15, 0.44) : new THREE.BoxGeometry(0.44, 0.15, across)
            const count = Math.max(1, Math.round(length / 0.5))
            for (let i = 0; i < count; i++) {
                const plank = shadow(new THREE.Mesh(geometry, materials.wood))
                const offset = -length / 2 + (i + 0.5) * (length / count)
                plank.position.set(centerX + (alongZ ? 0 : offset), 0.9, centerZ + (alongZ ? offset : 0))
                plank.position[alongZ ? 'x' : 'z'] += (rand() - 0.5) * 0.06
                plank.rotation.y = (rand() - 0.5) * 0.04
                group.add(plank)
            }
            // Dark beams under both edges
            const beamGeometry = alongZ ? new THREE.BoxGeometry(0.22, 0.3, sizeZ) : new THREE.BoxGeometry(sizeX, 0.3, 0.22)
            for (const side of [-1, 1]) {
                const beam = shadow(new THREE.Mesh(beamGeometry, materials.darkWood))
                if (alongZ) beam.position.set(centerX + side * (sizeX / 2 - 0.11), 0.7, centerZ)
                else beam.position.set(centerX, 0.7, centerZ + side * (sizeZ / 2 - 0.11))
                group.add(beam)
            }
        }
        boards(0, stem / 2, width, stem, true)
        boards(0, headZ, headWidth, head, false)
        for (const x of fingerXs) boards(x, fingerZ, fingerWidth, finger, true)

        // Piles sticking out above the deck (the boats tie up to them)
        const pileGeometry = new THREE.CylinderGeometry(0.17, 0.2, 3.1, 6)
        const pile = (x, z) => {
            const mesh = shadow(new THREE.Mesh(pileGeometry, materials.darkWood))
            mesh.position.set(x, -0.3, z)
            group.add(mesh)
        }
        for (let z = 3; z < stem - 1; z += 3.2) for (const side of [-1, 1]) pile(side * (width / 2 + 0.12), z)
        for (const x of fingerXs) {
            for (const side of [-1, 1]) {
                pile(x + side * (fingerWidth / 2 + 0.12), stem + head + finger * 0.45)
                pile(x + side * (fingerWidth / 2 + 0.12), stem + head + finger - 0.3)
            }
        }
        for (let i = 0; i <= berths * 2; i++) {
            const x = -headWidth / 2 + (i * headWidth) / (berths * 2)
            // Not in the middle of the way from the walkway
            if (Math.abs(x) > width / 2 + 0.4) pile(x, stem - 0.12)
        }

        // Each berth's player color painted on the head's edge, and a cleat
        const cleatGeometry = new THREE.BoxGeometry(0.5, 0.12, 0.14)
        const berthList = []
        for (let i = 0; i < berths; i++) {
            const x = (i - (berths - 1) / 2) * spacing
            const mark = new THREE.Mesh(new THREE.BoxGeometry(spacing - fingerWidth - 0.6, 0.02, 0.5), colorMaterial(PLAYER_COLORS[i % PLAYER_COLORS.length]))
            mark.position.set(x, DECK_TOP + 0.005, stem + head - 0.45)
            mark.receiveShadow = true
            group.add(mark)
            const cleat = shadow(new THREE.Mesh(cleatGeometry, materials.darkWood))
            cleat.position.set(x, DECK_TOP + 0.06, stem + head - 0.9)
            group.add(cleat)
            berthList.push({ position: [x, stem + head + 1], angle: 0 })
        }

        // Lanterns at the end of every finger and where the walkway meets the head
        const lanternColliders = []
        const addLantern = (x, z) => {
            const light = lantern.create({ params: { height: 2.2 }, materials }).object
            light.position.set(x, DECK_TOP, z)
            group.add(light)
            lanternColliders.push({ shape: 'cuboid', size: [0.12, 1.1, 0.12], position: [x, DECK_TOP + 1.1, z] })
        }
        // (on the edge, out of the way)
        fingerXs.forEach((x, i) => addLantern(x + (i < berths / 2 ? -1 : 1) * (fingerWidth / 2 - 0.15), stem + head + finger - 0.6))
        addLantern(-width / 2 - 0.4, stem + 0.5)
        addLantern(width / 2 + 0.4, stem + 0.5)

        // Boats bump into every part; on foot they are the floor
        const block = (x, z, halfX, halfZ) => ({ shape: 'cuboid', size: [halfX + 0.2, 1.5, halfZ], position: [x, 0, z], ground: true })
        return {
            object: group,
            colliders: [
                block(0, stem / 2, width / 2, stem / 2),
                block(0, headZ, headWidth / 2, head / 2),
                ...fingerXs.map((x) => block(x, fingerZ, fingerWidth / 2, finger / 2)),
                ...lanternColliders
            ],
            // Overlapping a little where the parts meet, so walking across is seamless
            walkable: [
                { size: [width / 2, stem / 2 + 1], position: [0, DECK_TOP, stem / 2 - 0.5] },
                { size: [headWidth / 2, head / 2], position: [0, DECK_TOP, headZ] },
                ...fingerXs.map((x) => ({ size: [fingerWidth / 2, finger / 2 + 0.5], position: [x, DECK_TOP, fingerZ - 0.5] }))
            ],
            berths: berthList
        }
    }
}
