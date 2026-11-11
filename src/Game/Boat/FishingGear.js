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
// style (see data/rods.js): 'classic' | 'bamboo' | 'carbon' | 'telescopic' | 'trolling' | 'golden'.
// A plain color string is a classic rod of that color.
export function createRod(options = {}) {
    const { style = 'classic', color = ROD_COLORS[0] } = typeof options === 'string' ? { color: options } : options
    const rod = new THREE.Group()
    const add = (geometry, material, y) => {
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.y = y
        mesh.castShadow = true
        rod.add(mesh)
        return mesh
    }
    // A tapering piece of the blank from y0 to y1
    const blank = (y0, y1, bottom, top, material) => add(new THREE.CylinderGeometry(top, bottom, y1 - y0, 6), material, (y0 + y1) / 2)
    const ring = (y, radius, material) => add(new THREE.CylinderGeometry(radius, radius, 0.025, 8), material, y)
    const reel = (y, radius, width, material, z = 0.06) => {
        const mesh = add(new THREE.CylinderGeometry(radius, radius, width, 10), material, y)
        mesh.rotation.z = Math.PI / 2
        mesh.position.z = z
        return mesh
    }
    const main = colorMaterial(color)
    const cork = colorMaterial('#b98b55')
    const dark = colorMaterial('#1d1f26')
    const steel = colorMaterial('#c8ccd4')
    let tipY = 2.15

    if (style === 'bamboo') {
        // Cane in segments with darker knots, cork grip, small reel
        add(new THREE.CylinderGeometry(0.026, 0.028, 0.4, 6), cork, 0.2)
        const knot = colorMaterial('#8a6a35')
        const joints = [0.42, 0.95, 1.45, 1.9, 2.2]
        for (let i = 0; i < joints.length - 1; i++) {
            const bottom = 0.026 - i * 0.005
            blank(joints[i], joints[i + 1], bottom, bottom - 0.004, main)
            ring(joints[i + 1], bottom - 0.001, knot)
        }
        reel(0.34, 0.04, 0.045, steel)
        tipY = 2.2
    } else if (style === 'carbon') {
        // Long foam grip, red thread wraps, thin black blank, big silver reel
        add(new THREE.CylinderGeometry(0.03, 0.032, 0.55, 8), dark, 0.275)
        blank(0.55, 2.35, 0.016, 0.003, main)
        const wrap = colorMaterial('#e63946')
        for (const y of [0.62, 1.1, 1.6, 2.05]) ring(y, 0.012 - (y - 0.6) * 0.004, wrap)
        reel(0.42, 0.055, 0.06, steel)
        tipY = 2.35
    } else if (style === 'telescopic') {
        // Stepped sections, each with a collar
        add(new THREE.CylinderGeometry(0.028, 0.03, 0.42, 8), dark, 0.21)
        const sections = [0.42, 1.0, 1.55, 2.05, 2.45]
        for (let i = 0; i < sections.length - 1; i++) {
            const radius = 0.02 - i * 0.004
            blank(sections[i], sections[i + 1], radius, radius - 0.002, main)
            ring(sections[i] + 0.02, radius + 0.004, dark)
        }
        reel(0.36, 0.045, 0.05, colorMaterial('#2f6db5'))
        tipY = 2.45
    } else if (style === 'trolling') {
        // Short and thick: gimbal butt, big golden lever reel on top, roller tip
        add(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 8), steel, 0.06)
        add(new THREE.CylinderGeometry(0.034, 0.034, 0.45, 8), dark, 0.34)
        blank(0.56, 1.72, 0.028, 0.008, main)
        const gold = colorMaterial('#f2c14e')
        const big = reel(0.62, 0.075, 0.085, gold, 0.09)
        big.position.y = 0.66
        for (const y of [0.9, 1.2, 1.5]) ring(y, 0.03 - (y - 0.9) * 0.02, steel)
        const roller = add(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 8), steel, 1.72)
        roller.rotation.z = Math.PI / 2
        tipY = 1.75
    } else if (style === 'golden') {
        // Golden blank, dark wood grip, glowing gems at the butt and the tip
        add(new THREE.CylinderGeometry(0.027, 0.03, 0.44, 8), colorMaterial('#3b2416'), 0.22)
        blank(0.44, 2.25, 0.017, 0.004, main)
        const gem = colorMaterial('#7ff6ff', true)
        add(new THREE.OctahedronGeometry(0.035, 0), gem, -0.02)
        add(new THREE.OctahedronGeometry(0.022, 0), gem, 2.25)
        for (const y of [0.8, 1.3, 1.8]) ring(y, 0.013 - (y - 0.8) * 0.004, colorMaterial('#fff1c1'))
        reel(0.36, 0.05, 0.055, colorMaterial('#f2c14e'))
        tipY = 2.25
    } else {
        add(new THREE.CylinderGeometry(0.024, 0.026, 0.42, 6), colorMaterial('#4a3426'), 0.21)
        add(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 6), dark, 0.44)
        add(new THREE.CylinderGeometry(0.004, 0.016, 1.7, 5), main, 0.46 + 0.85)
        // Spinning reel under the handle
        reel(0.36, 0.045, 0.05, steel)
    }

    const tip = new THREE.Object3D()
    tip.position.y = tipY
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

    // Invisible box around the tub for the crosshair (F opens your catch)
    const aim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, height + 0.3, length + 0.2), aimMaterial)
    aim.position.set(tub.x, tub.y + (height + 0.3) / 2, tub.z)
    aim.userData.keep = true
    root.add(aim)

    return {
        rods,
        slots,
        tub: {
            aim,
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
