import * as THREE from 'three/webgpu'
import { colorMaterial, shadow } from '../materials.js'
import { mergeByMaterial } from '../../utils/merge.js'
import { createLabel } from '../Label.js'
import { createAvatar } from '../../Character/Avatar.js'
import { createRod, createCatchMesh } from '../../Boat/FishingGear.js'
import { rods } from '../../../data/rods.js'
import { fish } from '../../../data/fish.js'
import { lookOptions } from '../../Fishing/catalog.js'

// What each kind of stall sells, how it looks and who runs it
const KINDS = {
    rods: {
        sign: 'CAÑAS',
        label: 'Comprar cañas',
        accent: '#2f6db5',
        vendor: { suitColor: '#3d6bd1', mask: false, hat: '#e9d8a6', gloves: '#e9d8a6', skin: '#c68a5b' }
    },
    style: {
        sign: 'ROPA',
        label: 'Comprar ropa y sombreros',
        accent: '#ef5d8e',
        vendor: { suitColor: '#ef5d8e', mask: false, hat: { style: 'beanie', color: '#ffb347' }, gloves: '#ffffff', apron: '#ffffff', skin: '#d9a066' }
    },
    fish: {
        sign: 'PESCADERÍA',
        label: 'Vender pescado',
        accent: '#e63946',
        vendor: { suitColor: '#2a9d8f', mask: false, apron: '#f4f1ea', gloves: '#f4f1ea', skin: '#e0ac69' }
    }
}

// Market stall of the fishing port with a vendor behind the counter. Built
// facing +z: customers come from the front. On foot next to the counter, F
// opens the shop (the 'station' below): kind 'rods' sells the rods of
// data/rods.js (all of them hang on the back rack), kind 'fish' buys your catch.
export default {
    description: 'Puesto del puerto con vendedor (cañas o pescadería)',
    animated: true,
    // Space around it kept free of random plants
    footprint: 4.5,
    schema: {
        kind: { type: 'enum', values: ['rods', 'fish', 'style'], default: 'fish' }
    },
    create({ params, rand, materials }) {
        const kind = KINDS[params.kind]
        const group = new THREE.Group()
        const structure = new THREE.Group()
        group.add(structure)
        const box = (w, h, d, x, y, z, material) => {
            const mesh = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material))
            mesh.position.set(x, y, z)
            structure.add(mesh)
            return mesh
        }
        const accent = colorMaterial(kind.accent)
        const white = colorMaterial('#f4f1ea')

        // Wooden floor, counter and posts
        // (a bit above the ground: the island grass is 0.2 m higher than where props stand)
        box(3.8, 0.14, 2.8, 0, 0.25, -0.1, materials.wood)
        box(3.2, 0.95, 0.6, 0, 0.6, 0.7, materials.wood)
        box(3.4, 0.08, 0.8, 0, 1.11, 0.7, materials.darkWood)
        box(3.22, 0.18, 0.02, 0, 0.85, 1.01, accent)
        for (const x of [-1.68, 1.68]) {
            box(0.12, 2.75, 0.12, x, 1.45, 1.05, materials.darkWood)
            box(0.12, 3.05, 0.12, x, 1.6, -1.15, materials.darkWood)
        }

        // Striped awning, sloping down to the front, with a scalloped edge
        const awning = new THREE.Group()
        awning.position.set(0, 3.0, -0.05)
        awning.rotation.x = 0.13
        structure.add(awning)
        const stripes = 7
        const stripeWidth = 3.8 / stripes
        for (let i = 0; i < stripes; i++) {
            const stripe = shadow(new THREE.Mesh(new THREE.BoxGeometry(stripeWidth, 0.06, 2.9), i % 2 ? white : accent))
            stripe.position.x = -1.9 + stripeWidth * (i + 0.5)
            awning.add(stripe)
            const flap = shadow(new THREE.Mesh(new THREE.BoxGeometry(stripeWidth * 0.86, 0.26, 0.04), i % 2 ? white : accent))
            flap.position.set(stripe.position.x, -0.15, 1.45)
            awning.add(flap)
        }

        if (params.kind === 'rods') {
            // Back rack with every rod of the shop, so you see their shapes
            box(3.2, 1.6, 0.08, 0, 1.6, -1.12, materials.wood)
            box(3.2, 0.08, 0.3, 0, 0.35, -0.95, materials.darkWood)
            rods.forEach((data, i) => {
                const rod = createRod({ style: data.style, color: data.color })
                rod.position.set(-1.35 + (i * 2.7) / Math.max(1, rods.length - 1), 0.4, -0.95)
                rod.rotation.z = (rand() - 0.5) * 0.1
                rod.rotation.x = -0.08
                structure.add(rod)
            })
            // A couple of reels and a tackle box on the counter
            box(0.5, 0.22, 0.3, -0.9, 1.26, 0.65, colorMaterial('#e9a53b'))
            box(0.5, 0.04, 0.3, -0.9, 1.39, 0.65, colorMaterial('#c47f1e'))
            for (const x of [0.6, 1.0]) {
                const reel = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 10), colorMaterial('#c8ccd4')))
                reel.rotation.x = Math.PI / 2
                reel.position.set(x, 1.25, 0.7)
                structure.add(reel)
            }
        } else if (params.kind === 'style') {
            // Two mannequins showing outfits, and hats on the counter
            for (const [x, skin, hat] of [[-1.25, 'coral', 'pirata'], [1.25, 'marinero', 'capitan']]) {
                const mannequin = createAvatar(lookOptions(skin, hat))
                mannequin.object.position.set(x, 0.32, -0.75)
                structure.add(mannequin.object)
            }
            for (const [x, hat] of [[-0.8, 'paja'], [0, 'gorra'], [0.8, 'corona']]) {
                const head = createAvatar({ ...lookOptions('galileo', hat), mask: false })
                // A bust: only the head, the hat and the shoulders show above the counter
                head.object.position.set(x, -0.3, 0.7)
                structure.add(head.object)
            }
        } else {
            // Ice tray on the counter with the day's fish, crates on the floor
            box(2.7, 0.1, 0.62, 0, 1.2, 0.7, colorMaterial('#d8f1f7'))
            const caught = fish.filter((species) => !species.junk)
            for (let i = 0; i < 6; i++) {
                const species = caught[Math.floor(rand() * Math.min(caught.length, 9))]
                const mesh = createCatchMesh(species, 0.42 + rand() * 0.15)
                mesh.position.set(-1.1 + i * 0.44, 1.3, 0.7 + (rand() - 0.5) * 0.15)
                mesh.rotation.set(0, Math.PI / 2 + (rand() - 0.5) * 0.4, Math.PI / 2)
                structure.add(mesh)
            }
            for (const x of [-1.2, 1.25]) {
                box(0.7, 0.42, 0.5, x, 0.35, 1.45, materials.wood)
                box(0.6, 0.04, 0.4, x, 0.58, 1.45, colorMaterial('#d8f1f7'))
            }
            // A big one hanging at the back, for show
            const trophy = createCatchMesh(fish.find((species) => species.id === 'atun') ?? caught[0], 1.3)
            trophy.position.set(1.0, 2.1, -1.0)
            trophy.rotation.set(-Math.PI / 2, 0, 0)
            structure.add(trophy)
            box(0.03, 0.4, 0.03, 1.0, 2.6, -1.0, colorMaterial('#1d1f26'))
        }
        mergeByMaterial(structure)

        // The vendor behind the counter
        const vendor = createAvatar(kind.vendor)
        vendor.object.position.set(0, 0.32, -0.35)
        group.add(vendor.object)

        const sign = createLabel(kind.sign, kind.accent)
        sign.scale.set(4.4, 1.1, 1)
        sign.position.y = 3.95
        group.add(sign)

        const phase = rand() * 10
        return {
            object: group,
            colliders: [
                { shape: 'cuboid', size: [1.7, 0.6, 0.4], position: [0, 0.6, 0.7] },
                { shape: 'cuboid', size: [1.75, 1.5, 0.75], position: [0, 1.5, -0.55] },
                { shape: 'cuboid', size: [0.08, 1.4, 0.08], position: [-1.68, 1.4, 1.05] },
                { shape: 'cuboid', size: [0.08, 1.4, 0.08], position: [1.68, 1.4, 1.05] }
            ],
            // Stand in front of the counter and press F
            stations: [{ position: [0, 2.1], radius: 1.9, payload: { type: 'shop', shop: params.kind, label: kind.label } }],
            update(time) {
                // Breathing, and looking around the port now and then
                vendor.pose('stand', 0, 1 / 60, time)
                vendor.object.rotation.y = Math.sin(time * 0.35 + phase) * 0.35
                sign.position.y = 3.95 + Math.sin(time * 1.3 + phase) * 0.06
            }
        }
    }
}
