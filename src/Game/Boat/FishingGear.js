import * as THREE from 'three/webgpu'
import { mergeByMaterial } from '../utils/merge.js'
import { colorMaterial } from '../World/materials.js'

const _up = new THREE.Vector3(0, 1, 0)
const ROD_COLORS = ['#f2c14e', '#e63946', '#1d1f26', '#2f6db5']
// Invisible, thicker stand-in for each rod: easier to aim at with the crosshair
const aimMaterial = new THREE.MeshBasicMaterial({ visible: false })
const TUB = { width: 0.85, length: 0.6, height: 0.42, wall: 0.04 }

// A fishing rod standing on its butt (origin), pointing up +y.
// userData.tip is an empty at the tip, where the line comes out.
export function createRod(color = ROD_COLORS[0]) {
    const rod = new THREE.Group()
    const add = (geometry, material, y) => {
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.y = y
        mesh.castShadow = true
        rod.add(mesh)
        return mesh
    }
    add(new THREE.CylinderGeometry(0.024, 0.026, 0.42, 6), colorMaterial('#4a3426'), 0.21)
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 6), colorMaterial('#1d1f26'), 0.44)
    add(new THREE.CylinderGeometry(0.004, 0.016, 1.7, 5), colorMaterial(color), 0.46 + 0.85)
    // Spinning reel under the handle
    const reel = add(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 8), colorMaterial('#c8ccd4'), 0.36)
    reel.rotation.z = Math.PI / 2
    reel.position.z = 0.06
    const tip = new THREE.Object3D()
    tip.position.y = 2.15
    rod.add(tip)
    rod.userData.tip = tip
    return rod
}

// Rod holders with rods on the gunwale and a fish tub on the deck.
// Positions are in boat local space (see BoatMesh.createModelBoat).
// Returns what the fishing system needs: the rods (one is taken to fish) and
// the tub, where caught fish are stored.
export function buildFishingGear(root, { holders, tub }) {
    const gear = new THREE.Group()
    root.add(gear)
    const steel = colorMaterial('#c8ccd4')
    const rods = []
    const slots = []

    holders.forEach(({ position, side }, index) => {
        // Leaning outboard and aft, like flush mount holders
        const direction = new THREE.Vector3(side * 0.55, 1, -0.5).normalize()
        const quaternion = new THREE.Quaternion().setFromUnitVectors(_up, direction)
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.3, 8), steel)
        // Flush mount: only a lip shows above the gunwale
        tube.position.copy(position).addScaledVector(direction, -0.12)
        tube.quaternion.copy(quaternion)
        gear.add(tube)
        const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 8), steel)
        flange.position.copy(position).add(new THREE.Vector3(0, 0.01, 0))
        gear.add(flange)

        const rod = createRod(ROD_COLORS[index % ROD_COLORS.length])
        rod.position.copy(position).addScaledVector(direction, -0.2)
        rod.quaternion.copy(quaternion)
        rod.userData.keep = true
        root.add(rod)
        rods.push(rod)

        const aim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.4, 6), aimMaterial)
        aim.position.copy(position).addScaledVector(direction, 0.6)
        aim.quaternion.copy(quaternion)
        aim.userData.keep = true
        root.add(aim)
        // rod: the one that lives here (hidden while it's in your hand)
        slots.push({ rod, aim })
    })

    // Tub: open box with water inside, the catch lies on top
    const { width, length, height, wall } = TUB
    const white = colorMaterial('#f4f1ea')
    const blue = colorMaterial('#2f6db5')
    const box = (w, h, l, x, y, z, material) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material)
        mesh.position.set(tub.x + x, tub.y + y, tub.z + z)
        gear.add(mesh)
    }
    box(width, wall, length, 0, wall / 2, 0, white)
    for (const side of [-1, 1]) {
        box(wall, height, length, side * (width - wall) / 2, height / 2, 0, white)
        box(width, height, wall, 0, height / 2, side * (length - wall) / 2, white)
    }
    // Blue rim on top, a hair above the walls (no z-fighting)
    for (const side of [-1, 1]) {
        box(wall + 0.02, 0.04, length + 0.02, side * (width - wall) / 2, height + 0.02, 0, blue)
        box(width + 0.02, 0.04, wall + 0.02, 0, height + 0.02, side * (length - wall) / 2, blue)
    }
    box(width - wall * 2, 0.02, length - wall * 2, 0, height * 0.62, 0, colorMaterial('#2e7fa8'))

    gear.traverse((child) => {
        child.castShadow = true
        child.receiveShadow = true
    })
    mergeByMaterial(gear)

    const contents = new THREE.Group()
    contents.userData.keep = true
    contents.position.set(tub.x, tub.y + height * 0.62 + 0.03, tub.z)
    root.add(contents)

    return {
        rods,
        slots,
        tub: {
            contents,
            // Inner half sizes, to lay the fish inside
            half: { x: (width - wall * 2) / 2, z: (length - wall * 2) / 2 },
            // Where caught fish fly to (boat local)
            mouth: new THREE.Vector3(tub.x, tub.y + height + 0.25, tub.z)
        }
    }
}

// Low poly fish (or junk) facing +z, `length` meters long
export function createCatchMesh(species, length) {
    const group = new THREE.Group()
    if (species.junk === 'boot') {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.14), colorMaterial('#5b4636'))
        leg.position.y = 0.15
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.28), colorMaterial('#5b4636'))
        foot.position.set(0, 0.05, 0.07)
        group.add(leg, foot)
        return group
    }
    if (species.junk === 'bottle') {
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 8), colorMaterial('#5fae6e'))
        bottle.rotation.x = Math.PI / 2
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.1, 8), colorMaterial('#5fae6e'))
        neck.rotation.x = Math.PI / 2
        neck.position.z = 0.16
        group.add(bottle, neck)
        return group
    }
    const bodyMaterial = colorMaterial(species.color)
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), bodyMaterial)
    body.scale.set(0.16, species.tall ?? 0.26, 0.5)
    const belly = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), colorMaterial(species.belly ?? '#f1efe6'))
    belly.scale.set(0.13, 0.16, 0.42)
    belly.position.y = -0.04
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 3), colorMaterial(species.fin ?? species.color))
    tail.rotation.x = Math.PI / 2
    tail.scale.x = 0.25
    tail.position.z = -0.3
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 3), colorMaterial(species.fin ?? species.color))
    fin.scale.z = 2
    fin.scale.x = 0.25
    fin.position.set(0, 0.13, -0.02)
    group.add(body, belly, tail, fin)
    if (species.bill) {
        const bill = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.3, 4), colorMaterial(species.color))
        bill.rotation.x = Math.PI / 2
        bill.position.z = 0.38
        group.add(bill)
    }
    group.scale.setScalar(length / 0.7)
    return group
}
