import * as THREE from 'three/webgpu'
import { mergeByMaterial } from '../utils/merge.js'
import { sanitize } from '../utils/schema.js'
import { colorMaterial } from '../World/materials.js'
import { buildFishingGear, createRod } from './FishingGear.js'

// Validation rules for data/boats.js
const PHYSICS_SCHEMA = {
    mass: { type: 'number', default: 6, min: 1, max: 100 },
    power: { type: 'number', default: 11, min: 0, max: 80 },
    boostPower: { type: 'number', default: 18, min: 0, max: 120 },
    turn: { type: 'number', default: 1.7, min: 0, max: 10 },
    forwardDrag: { type: 'number', default: 0.9, min: 0.05, max: 5 },
    lateralDrag: { type: 'number', default: 3.2, min: 0, max: 20 },
    floatDepth: { type: 'number', default: 0.35, min: 0.1, max: 1.5 },
    verticalDamping: { type: 'number', default: 1.6, min: 0, max: 10 }
}

export const BOAT_SCHEMA = {
    name: { type: 'string', default: 'Barco' },
    description: { type: 'string', default: '' },
    // open: benches · console: center console (canopy = T-top) · cabin: closed cabin
    // ferry: walkable deck with double seats, helm console and a long canopy
    // fishing: walkable deck, center console with T-top, rod holders, fish tub and lights
    layout: { type: 'enum', values: ['open', 'console', 'cabin', 'ferry', 'fishing'], default: 'open' },
    size: {
        type: 'object',
        default: { width: 2.2, length: 5.2, height: 1.1 },
        schema: {
            width: { type: 'number', default: 2.2, min: 0.8, max: 8 },
            length: { type: 'number', default: 5.2, min: 2, max: 20 },
            height: { type: 'number', default: 1.1, min: 0.5, max: 4 }
        }
    },
    colors: {
        type: 'object',
        default: { hull: '#f4f1ea', stripe: '#2346a8', interior: '#c9b79c' },
        schema: {
            hull: { type: 'color', default: '#f4f1ea' },
            stripe: { type: 'color', default: '#2346a8' },
            interior: { type: 'color', default: '#c9b79c' }
        }
    },
    canopy: { type: 'color', nullable: true, default: null },
    sail: {
        type: 'object',
        nullable: true,
        default: null,
        schema: {
            color: { type: 'color', default: '#fdf6e3' },
            height: { type: 'number', default: 6, min: 2, max: 20 }
        }
    },
    // Outboard motors at the stern (0 for a sailboat)
    motors: { type: 'number', default: 1, min: 0, max: 3, integer: true },
    cargo: { type: 'boolean', default: false },
    physics: {
        type: 'object',
        default: Object.fromEntries(Object.entries(PHYSICS_SCHEMA).map(([key, field]) => [key, field.default])),
        schema: PHYSICS_SCHEMA
    }
}

// Model proportions everything is designed at; `size` scales from these
export const NOMINAL = { width: 2.2, length: 5.2, height: 1.1 }

// Looks up a boat type and validates it. Unknown ids fall back to the first type.
export function resolveBoat(boats, id, path, warn) {
    let definition = boats?.[id]
    if (!definition) {
        const fallback = Object.keys(boats ?? {})[0]
        warn(`${path}: no existe el barco "${id}". Disponibles: ${Object.keys(boats ?? {}).join(', ') || 'ninguno'}${fallback ? `, se usa "${fallback}"` : ''}`)
        definition = boats?.[fallback] ?? {}
        id = fallback
    }
    return { id, ...sanitize(BOAT_SCHEMA, definition, `boats.${id}`, warn) }
}

// Hull outline seen from above, in nominal units: (x, z), bow at +z
const HULL_OUTLINE = [[-1.1, -2.5], [1.1, -2.5], [1.15, 0.8], [0.7, 2.0], [0, 2.7], [-0.7, 2.0], [-1.15, 0.8]]
// Inside of the bulwarks of open-deck boats (the ferry): thin sides, a transom at the stern
const DECK_OUTLINE = [[-1.0, -2.38], [1.0, -2.38], [1.05, 0.8], [0.62, 1.95], [0, 2.5], [-0.62, 1.95], [-1.05, 0.8]]

export function createHullGeometry(scale, height) {
    return extrudeOutline(HULL_OUTLINE, scale, height)
}

// Hull band with the deck outline cut out: the bulwarks around a sunken deck
function createRimGeometry(scale, height, holeScale = 1) {
    return extrudeOutline(HULL_OUTLINE, scale, height, DECK_OUTLINE, holeScale)
}

// Half width of an outline (right side) at a given z, in the same units
function halfWidthAt(outline, z) {
    const side = outline.filter(([x]) => x >= 0).sort((a, b) => a[1] - b[1])
    if (z <= side[0][1]) return side[0][0]
    for (let i = 1; i < side.length; i++) {
        const [x0, z0] = side[i - 1]
        const [x1, z1] = side[i]
        if (z <= z1) return x0 + ((x1 - x0) * (z - z0)) / (z1 - z0)
    }
    return 0
}

function extrudeOutline(points, scale, height, holePoints = null, holeScale = 1) {
    const shape = new THREE.Shape()
    shape.moveTo(points[0][0] * scale, points[0][1] * scale)
    for (const [x, y] of points.slice(1)) shape.lineTo(x * scale, y * scale)
    shape.closePath()
    if (holePoints) {
        const hole = new THREE.Path()
        hole.moveTo(holePoints[0][0] * holeScale, holePoints[0][1] * holeScale)
        for (const [x, y] of holePoints.slice(1)) hole.lineTo(x * holeScale, y * holeScale)
        hole.closePath()
        shape.holes.push(hole)
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
    // Shape (x, y) -> boat (x, z), extrusion goes upward
    geometry.rotateX(Math.PI / 2)
    geometry.translate(0, height, 0)
    return geometry
}

// Builds the low poly model of a boat definition. The origin is the center
// of the physics collider (half the hull height above the keel).
export function createBoatMesh(definition) {
    const { colors, size } = definition
    const root = new THREE.Group()
    const model = new THREE.Group()
    root.add(model)

    const hullMaterial = colorMaterial(colors.hull)
    const stripeMaterial = colorMaterial(colors.stripe)
    const interiorMaterial = colorMaterial(colors.interior)
    const dark = colorMaterial('#1d1f26')
    const orange = colorMaterial('#ff6a2b')
    const metal = colorMaterial('#c8ccd4')

    const add = (mesh) => {
        mesh.castShadow = true
        mesh.receiveShadow = true
        model.add(mesh)
        return mesh
    }

    if (OPEN_DECK.includes(definition.layout)) {
        // Open hull: a solid bottom up to the deck, bulwarks around it, a dark gunwale on top
        const hull = add(new THREE.Mesh(createHullGeometry(1, FERRY_DECK - 0.02 + 0.1), hullMaterial))
        hull.position.y = -0.1
        const deck = add(new THREE.Mesh(extrudeOutline(DECK_OUTLINE, 1, 0.02), interiorMaterial))
        deck.position.y = FERRY_DECK - 0.02
        const rim = add(new THREE.Mesh(createRimGeometry(1, 1 - FERRY_DECK), hullMaterial))
        rim.position.y = FERRY_DECK
        // Sits on top of the bulwarks (no overlap) and a bit wider on both sides:
        // coplanar faces with the white rim made it flicker (z-fighting)
        const gunwale = add(new THREE.Mesh(createRimGeometry(1.02, 0.06, 0.985), dark))
        gunwale.position.y = 1
        const rubLine = add(new THREE.Mesh(createHullGeometry(1.02, 0.07), stripeMaterial))
        rubLine.position.y = 0.38
    } else {
        const hull = add(new THREE.Mesh(createHullGeometry(1, 1.1), hullMaterial))
        hull.position.y = -0.1
        const stripe = add(new THREE.Mesh(createHullGeometry(1.02, 0.18), stripeMaterial))
        stripe.position.y = 0.55
        const deck = add(new THREE.Mesh(createHullGeometry(0.86, 0.05), interiorMaterial))
        deck.position.y = 0.98
    }

    if (definition.layout === 'open') {
        const seatGeometry = new THREE.BoxGeometry(1.8, 0.3, 0.5)
        for (const z of [-1.6, 0.4]) {
            const seat = add(new THREE.Mesh(seatGeometry, hullMaterial))
            seat.position.set(0, 1.15, z)
        }
    }

    if (definition.layout === 'console') {
        // Center console with windshield and a leaning post behind it
        const consoleBox = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.95, 1), hullMaterial))
        consoleBox.position.set(0, 1.45, 0.2)
        const windshield = add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.45, 0.04), colorMaterial('#2b3a4a')))
        windshield.position.set(0, 2.1, 0.62)
        windshield.rotation.x = -0.45
        const post = add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.4), interiorMaterial))
        post.position.set(0, 1.4, -0.75)
        const bowSeat = add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 0.6), hullMaterial))
        bowSeat.position.set(0, 1.12, 1.6)
    }

    if (definition.layout === 'cabin') {
        // Closed cabin forward, roof in the stripe color, dark window band
        const cabin = add(new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.05, 2.3), hullMaterial))
        cabin.position.set(0, 1.5, 0.75)
        const roof = add(new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 2.5), stripeMaterial))
        roof.position.set(0, 2.08, 0.7)
        const glass = colorMaterial('#26323f')
        const sideWindows = add(new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.32, 1.6), glass))
        sideWindows.position.set(0, 1.72, 0.65)
        const front = add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.05), glass))
        front.position.set(0, 1.72, 1.92)
        front.rotation.x = -0.35
        const bench = add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.5), hullMaterial))
        bench.position.set(0, 1.15, -1.9)
    }

    if (definition.cargo) {
        const crate = add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.5), orange))
        crate.position.set(-0.35, 1.25, -0.7)
        crate.rotation.y = 0.2
    }

    if (definition.canopy && definition.layout === 'console') {
        // T-top over the console
        const poleGeometry = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6)
        for (const x of [-0.55, 0.55]) {
            for (const z of [-0.95, 0.75]) {
                const pole = add(new THREE.Mesh(poleGeometry, metal))
                pole.position.set(x, 1.8, z)
            }
        }
        const top = add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 2.1), colorMaterial(definition.canopy)))
        top.position.set(0, 2.62, -0.1)
    } else if (definition.canopy && definition.layout === 'open') {
        const poleGeometry = new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6)
        for (const x of [-0.9, 0.9]) {
            for (const z of [-1.9, 0.6]) {
                const pole = add(new THREE.Mesh(poleGeometry, metal))
                pole.position.set(x, 1.75, z)
            }
        }
        const canopy = add(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 2.9), colorMaterial(definition.canopy)))
        canopy.position.set(0, 2.52, -0.65)
    }

    if (definition.sail) {
        const { height } = definition.sail
        const mast = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, height, 6), colorMaterial('#6d4c41')))
        mast.position.set(0, 1 + height / 2, 0.6)
        const boom = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), colorMaterial('#6d4c41')))
        boom.rotation.x = Math.PI / 2
        boom.position.set(0, 1.6, -0.6)

        const sailShape = new THREE.Shape()
        sailShape.moveTo(0, 0)
        sailShape.lineTo(-2.3, 0)
        sailShape.lineTo(0, height - 0.8)
        sailShape.closePath()
        const sailGeometry = new THREE.ShapeGeometry(sailShape)
        // Shape (x, y) -> boat (z, y): the sail hangs behind the mast
        sailGeometry.rotateY(-Math.PI / 2)
        const sail = add(new THREE.Mesh(sailGeometry, new THREE.MeshLambertMaterial({ color: definition.sail.color, side: THREE.DoubleSide, flatShading: true })))
        sail.position.set(0, 1.7, 0.55)
    }

    // (the ferry builds its motors at real size, see buildFerryDeck)
    const motorOffsets = OPEN_DECK.includes(definition.layout) ? [] : [[], [0], [-0.42, 0.42], [-0.62, 0, 0.62]][definition.motors]
    for (const x of motorOffsets) {
        const motor = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.6), dark))
        motor.position.set(x, 1.05, -2.75)
        const leg = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.22), dark))
        leg.position.set(x, 0.35, -2.75)
    }

    if (!OPEN_DECK.includes(definition.layout)) {
        const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.1, 6, 12), orange))
        ring.position.set(1.2, 0.75, -0.6)
        ring.rotation.y = Math.PI / 2
    }

    // Shift so the origin sits at the collider center, then scale to the defined size
    model.children.forEach((child) => (child.position.y -= NOMINAL.height / 2 - 0.05))
    model.scale.set(size.width / NOMINAL.width, size.height / NOMINAL.height, size.length / NOMINAL.length)
    mergeByMaterial(model)

    // The ferry's fittings are built in real meters (not stretched with the hull)
    if (definition.layout === 'ferry') root.userData.deck = buildFerryDeck(definition, root)
    if (definition.layout === 'fishing') root.userData.deck = buildFishingDeck(definition, root)
    return root
}

// Layouts with an open hull and a walkable deck (built in real meters)
const OPEN_DECK = ['ferry', 'fishing']

// Nominal height of the ferry's deck surface (the hull goes from -0.1 to 1)
const FERRY_DECK = 0.57
const FERRY_SEAT = { aisle: 0.8, width: 0.92, depth: 0.46, height: 0.4, pitch: 1.15 }
// Cabin light fixtures and the switch's pilot light: off (plain) / on (glowing)
const LIGHTS_OFF = colorMaterial('#d9d4c5')
const LIGHTS_ON = colorMaterial('#fff1c1', true)
// Clear height under the canopy: well above the head (1.75 m) so first person isn't cramped
const FERRY_HEADROOM = 2.5

// Helm on the ferry, in meters (boat local space, origin at the collider center):
// a console on the starboard side near the stern, the pilot standing behind it
export function ferryHelm(size) {
    const sy = size.height / NOMINAL.height
    const sz = size.length / NOMINAL.length
    const deckY = (FERRY_DECK - (NOMINAL.height / 2 - 0.05)) * sy
    const consoleZ = DECK_OUTLINE[0][1] * sz + 1.35
    // Console centered on the starboard seats, out of the aisle
    const consoleX = -(FERRY_SEAT.aisle / 2 + FERRY_SEAT.width / 2)
    return { deckY, consoleX, consoleZ, x: consoleX, z: consoleZ - 0.72, angle: 0 }
}

// Seats, helm console and canopy of the ferry. Returns the deck plan that the
// character walks on: walkable outline, obstacles, seats and the helm.
function buildFerryDeck(definition, root) {
    const { size, colors } = definition
    const sx = size.width / NOMINAL.width
    const sz = size.length / NOMINAL.length
    const helm = ferryHelm(size)
    const { deckY, consoleX, consoleZ } = helm
    const outline = DECK_OUTLINE.map(([x, z]) => [x * sx, z * sz])
    const innerHalf = (z) => halfWidthAt(DECK_OUTLINE, z / sz) * sx
    const outerHalf = (z) => halfWidthAt(HULL_OUTLINE, z / sz) * sx

    const group = new THREE.Group()
    root.add(group)
    const add = (mesh, parent = group) => {
        mesh.castShadow = true
        mesh.receiveShadow = true
        parent.add(mesh)
        return mesh
    }
    const cushion = colorMaterial('#a9d6e5')
    const frame = colorMaterial('#7a858f')
    const backrest = colorMaterial('#5f6b75')
    const dark = colorMaterial('#1d1f26')
    const metal = colorMaterial('#c8ccd4')
    const obstacles = []
    const seats = []
    // Axis-aligned box on the deck the character can't walk through
    const block = (x, z, halfX, halfZ) => obstacles.push({ minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ })

    // Helm console. The pilot stands behind it (toward the stern) facing the bow:
    // the wheel is on the console's aft face, the throttle on the pilot's right (-x)
    const consoleBox = add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 1, 0.5), colorMaterial(colors.hull)))
    consoleBox.position.set(consoleX, deckY + 0.5, consoleZ)
    const dash = add(new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.05, 0.52), dark))
    dash.position.set(consoleX, deckY + 1.02, consoleZ)
    const windshield = add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.32, 0.03), colorMaterial('#2b3a4a')))
    windshield.position.set(consoleX, deckY + 1.18, consoleZ + 0.2)
    windshield.rotation.x = -0.35
    block(consoleX, consoleZ, 0.38, 0.26)

    const { spin, lever, lightButton } = addHelmControls(group, add, consoleX, deckY, consoleZ - 0.25)

    // Double seats with backrests on both sides of a center aisle, facing the bow
    const { aisle, width, depth, height, pitch } = FERRY_SEAT
    const offset = aisle / 2 + width / 2
    let lastRow = consoleZ
    for (let z = consoleZ + 1.05; innerHalf(z + depth / 2) >= aisle / 2 + width + 0.04; z += pitch) {
        for (const side of [-1, 1]) {
            const x = side * offset
            const base = add(new THREE.Mesh(new THREE.BoxGeometry(width - 0.14, height - 0.1, 0.3), frame))
            base.position.set(x, deckY + (height - 0.1) / 2, z)
            const seat = add(new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, depth), cushion))
            seat.position.set(x, deckY + height - 0.05, z)
            const back = add(new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, 0.08), backrest))
            back.position.set(x, deckY + height + 0.28, z - depth / 2 - 0.02)
            back.rotation.x = -0.12
            const backCushion = add(new THREE.Mesh(new THREE.BoxGeometry(width - 0.08, 0.38, 0.03), cushion))
            backCushion.position.set(x, deckY + height + 0.3, z - depth / 2 + 0.035)
            backCushion.rotation.x = -0.12
            block(x, z - 0.02, width / 2, depth / 2 + 0.06)
            for (const place of [-1, 1]) seats.push({ x: x + place * width / 4, z: z - 0.08, angle: 0, y: deckY + height })
        }
        lastRow = z
    }

    // Canopy on poles over the seats and the helm. Its own material, so it
    // can fade out when the camera needs to see the deck
    const canopyMaterial = new THREE.MeshLambertMaterial({ color: definition.canopy ?? colors.hull, flatShading: true, transparent: true })
    const roofY = deckY + FERRY_HEADROOM
    const fromZ = consoleZ - 1.05
    const toZ = lastRow + 0.75
    const roofWidth = 2 * outerHalf(0) + 0.05
    const roof = add(new THREE.Mesh(new THREE.BoxGeometry(roofWidth, 0.06, toZ - fromZ), canopyMaterial))
    roof.position.set(0, roofY, (fromZ + toZ) / 2)
    for (const side of [-1, 1]) {
        const valance = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, toZ - fromZ), canopyMaterial))
        valance.position.set(side * roofWidth / 2, roofY - 0.08, (fromZ + toZ) / 2)
    }
    // Light fixtures under the roof along the aisle; when on they glow and the
    // character adds real lights at `lamps`
    const lamps = []
    const fixtures = []
    const lampCount = Math.max(2, Math.round((toZ - fromZ) / 3.2))
    for (let i = 0; i < lampCount; i++) {
        const z = fromZ + ((toZ - fromZ) * (i + 0.5)) / lampCount
        const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.7), LIGHTS_OFF)
        fixture.userData.keep = true
        fixture.position.set(0, roofY - 0.05, z)
        group.add(fixture)
        fixtures.push(fixture)
        lamps.push([0, roofY - 0.25, z])
    }

    const poles = Math.max(2, Math.ceil((toZ - fromZ) / 2.6) + 1)
    const poleGeometry = new THREE.CylinderGeometry(0.035, 0.035, roofY - deckY, 6)
    for (let i = 0; i < poles; i++) {
        const z = fromZ + 0.15 + ((toZ - fromZ - 0.3) * i) / (poles - 1)
        for (const side of [-1, 1]) {
            const pole = add(new THREE.Mesh(poleGeometry, metal))
            pole.position.set(side * (innerHalf(z) + 0.03), (deckY + roofY) / 2, z)
        }
    }

    // Life rings hanging outside the bulwarks
    const ringGeometry = new THREE.TorusGeometry(0.22, 0.07, 6, 12)
    const sy = size.height / NOMINAL.height
    for (const [side, z] of [[1, -0.6], [-1, 1.4]]) {
        const ring = add(new THREE.Mesh(ringGeometry, colorMaterial('#ff6a2b')))
        ring.position.set(side * (outerHalf(z) + 0.05), 0.24 * sy, z)
        ring.rotation.y = Math.PI / 2
    }

    const rimTop = (1 - (NOMINAL.height / 2 - 0.05)) * sy
    addOutboards(definition, add, rimTop, HULL_OUTLINE[0][1] * sz)

    mergeByMaterial(group)

    addLid(root, sx, sz, rimTop)

    return {
        y: deckY,
        outline,
        obstacles,
        seats,
        helm: { x: helm.x, z: helm.z, angle: helm.angle, wheel: spin, lever },
        canopyMaterial,
        lights: { lamps, glowing: [...fixtures, lightButton], on: LIGHTS_ON, off: LIGHTS_OFF }
    }
}

// Helm of the fishing boat (meters, boat local): a center console a bit ahead
// of amidships, the pilot standing behind it facing the bow
export function fishingHelm(size) {
    const sy = size.height / NOMINAL.height
    const deckY = (FERRY_DECK - (NOMINAL.height / 2 - 0.05)) * sy
    const consoleZ = size.length * 0.04
    const aftZ = consoleZ - 0.45
    return { deckY, consoleZ, aftZ, x: 0, z: aftZ - 0.55, angle: 0 }
}

// Center console fishing boat, built in real meters on the open hull:
// console with T-top (rods in a rocket launcher, lamps under it), leaning post,
// cooler seat, bow benches, anchor locker, transom bench, rod holders on the
// gunwales and the fish tub. Returns the deck plan for the character.
function buildFishingDeck(definition, root) {
    const { size, colors } = definition
    const sx = size.width / NOMINAL.width
    const sy = size.height / NOMINAL.height
    const sz = size.length / NOMINAL.length
    const helm = fishingHelm(size)
    const { deckY, consoleZ, aftZ } = helm
    const outline = DECK_OUTLINE.map(([x, z]) => [x * sx, z * sz])
    const innerHalf = (z) => halfWidthAt(DECK_OUTLINE, z / sz) * sx
    const outerHalf = (z) => halfWidthAt(HULL_OUTLINE, z / sz) * sx
    const rimTop = (1 - (NOMINAL.height / 2 - 0.05)) * sy
    // Top of the dark gunwale strip (see createBoatMesh)
    const gunwaleTop = (1.05 - (NOMINAL.height / 2 - 0.05)) * sy
    const sternZ = DECK_OUTLINE[0][1] * sz
    const bowZ = DECK_OUTLINE[4][1] * sz

    const group = new THREE.Group()
    root.add(group)
    const add = (mesh, parent = group) => {
        mesh.castShadow = true
        mesh.receiveShadow = true
        parent.add(mesh)
        return mesh
    }
    const box = (w, h, d, x, y, z, material) => {
        const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material))
        mesh.position.set(x, y, z)
        return mesh
    }
    const hull = colorMaterial(colors.hull)
    const cushion = colorMaterial('#e9e1cf')
    const dark = colorMaterial('#1d1f26')
    const metal = colorMaterial('#c8ccd4')
    const obstacles = []
    const seats = []
    const block = (x, z, halfX, halfZ) => obstacles.push({ minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ })
    const seat = (x, z, height, angle = 0) => seats.push({ x, z, angle, y: deckY + height })

    // Center console: dash, windshield, a glowing GPS screen and the helm controls
    box(1.1, 1, 0.9, 0, deckY + 0.5, consoleZ, hull)
    box(1.12, 0.05, 0.92, 0, deckY + 1.02, consoleZ, dark)
    const windshield = box(1.1, 0.42, 0.03, 0, deckY + 1.24, consoleZ + 0.3, colorMaterial('#2b3a4a'))
    windshield.rotation.x = -0.5
    const screen = box(0.34, 0.22, 0.04, 0.12, deckY + 1.17, consoleZ - 0.05, colorMaterial('#3aa0ff', true))
    screen.rotation.x = -0.35
    block(0, consoleZ, 0.58, 0.47)
    const { spin, lever, lightButton } = addHelmControls(group, add, 0, deckY, aftZ)

    // Leaning post behind the pilot: two padded seats with a backrest
    const leanZ = helm.z - 0.75
    box(1, 0.7, 0.55, 0, deckY + 0.35, leanZ, hull)
    box(1.02, 0.1, 0.57, 0, deckY + 0.75, leanZ, cushion)
    box(1, 0.45, 0.08, 0, deckY + 1.05, leanZ - 0.25, cushion)
    box(1.04, 0.04, 0.04, 0, deckY + 1.3, leanZ - 0.3, metal)
    block(0, leanZ, 0.52, 0.33)
    seat(-0.25, leanZ, 0.8)
    seat(0.25, leanZ, 0.8)

    // Cooler seat in front of the console
    const coolerZ = consoleZ + 1.05
    box(0.9, 0.42, 0.55, 0, deckY + 0.21, coolerZ, hull)
    box(0.92, 0.08, 0.57, 0, deckY + 0.46, coolerZ, cushion)
    block(0, coolerZ, 0.46, 0.3)
    seat(0, coolerZ, 0.5)

    // T-top over the helm: its own material so it can fade like the ferry canopy
    const canopyMaterial = new THREE.MeshLambertMaterial({ color: definition.canopy ?? colors.stripe, flatShading: true, transparent: true })
    const roofY = deckY + 2.45
    const fromZ = leanZ - 0.45
    const toZ = consoleZ + 0.7
    const roof = add(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.07, toZ - fromZ), canopyMaterial))
    roof.position.set(0, roofY, (fromZ + toZ) / 2)
    const poleGeometry = new THREE.CylinderGeometry(0.04, 0.04, roofY - deckY, 6)
    for (const x of [-0.6, 0.6]) {
        for (const z of [leanZ + 0.05, consoleZ + 0.3]) {
            const pole = add(new THREE.Mesh(poleGeometry, metal))
            pole.position.set(x, (deckY + roofY) / 2, z)
        }
    }
    // Rocket launcher: spare rods standing on the aft edge of the T-top
    const launcherZ = fromZ + 0.12
    box(1.6, 0.05, 0.05, 0, roofY + 0.06, launcherZ, metal)
    for (const [i, x] of [-0.6, -0.2, 0.2, 0.6].entries()) {
        const rod = createRod(['#f2c14e', '#e63946', '#1d1f26', '#2f6db5'][i])
        rod.position.set(x, roofY - 0.05, launcherZ)
        rod.rotation.x = -0.3
        rod.scale.setScalar(0.85)
        group.add(rod)
    }
    // Anchor light on a short mast in the middle of the T-top
    box(0.04, 0.3, 0.04, 0, roofY + 0.18, (fromZ + toZ) / 2, metal)
    const anchor = add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), colorMaterial('#ffffff', true)))
    anchor.position.set(0, roofY + 0.36, (fromZ + toZ) / 2)

    // Bow: two side benches facing inward and an anchor locker at the tip
    const benchFrom = coolerZ + 1.2
    const benchTo = benchFrom + 1.1
    const benchX = innerHalf(benchTo) - 0.25
    for (const side of [-1, 1]) {
        const z = (benchFrom + benchTo) / 2
        box(0.45, 0.4, benchTo - benchFrom, side * benchX, deckY + 0.2, z, hull)
        box(0.47, 0.08, benchTo - benchFrom + 0.02, side * benchX, deckY + 0.44, z, cushion)
        block(side * benchX, z, 0.24, (benchTo - benchFrom) / 2)
        for (const dz of [-0.3, 0.3]) seat(side * benchX, z + dz, 0.48, side > 0 ? -Math.PI / 2 : Math.PI / 2)
    }
    const lockerZ = benchTo + 0.75
    const lockerHalf = Math.max(0.2, innerHalf(lockerZ + 0.3) - 0.05)
    box(lockerHalf * 2, 0.35, 0.8, 0, deckY + 0.175, lockerZ, hull)
    box(lockerHalf * 2 - 0.1, 0.02, 0.7, 0, deckY + 0.36, lockerZ, colorMaterial(colors.interior))
    block(0, lockerZ, lockerHalf, 0.4)

    // Transom bench across the stern, its backrest against the transom
    const benchZ = sternZ + 0.27
    const transomHalf = innerHalf(benchZ) - 0.05
    box(transomHalf * 2, 0.4, 0.45, 0, deckY + 0.2, benchZ, hull)
    box(transomHalf * 2, 0.08, 0.47, 0, deckY + 0.44, benchZ, cushion)
    box(transomHalf * 2, 0.3, 0.06, 0, deckY + 0.66, sternZ + 0.05, cushion)
    block(0, benchZ, transomHalf, 0.24)
    for (const x of [-0.6, 0, 0.6]) seat(x, benchZ, 0.48)

    // Navigation lights on the bow gunwale (port red, starboard green), always on
    const navZ = bowZ - 1.6
    for (const [side, color] of [[1, '#ff3b3b'], [-1, '#38ff7a']]) {
        const light = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.14), colorMaterial(color, true)))
        light.position.set(side * (innerHalf(navZ) + outerHalf(navZ)) / 2, gunwaleTop + 0.035, navZ)
    }

    // Life ring on each side, outside the bulwarks
    const ringGeometry = new THREE.TorusGeometry(0.22, 0.07, 6, 12)
    for (const side of [-1, 1]) {
        const ring = add(new THREE.Mesh(ringGeometry, colorMaterial('#ff6a2b')))
        ring.position.set(side * (outerHalf(leanZ) + 0.05), 0.24 * sy, leanZ)
        ring.rotation.y = Math.PI / 2
    }

    addOutboards(definition, add, rimTop, HULL_OUTLINE[0][1] * sz)
    mergeByMaterial(group)

    // Lights for the night (L): lamps under the T-top (one over the fishing
    // deck) and LED strips along the inside of the bulwarks
    const fixtures = [consoleZ - 0.1, fromZ + 0.3].map((z) => {
        const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.25), LIGHTS_OFF)
        fixture.userData.keep = true
        fixture.position.set(0, roofY - 0.055, z)
        group.add(fixture)
        return fixture
    })
    const lamps = fixtures.map((fixture) => [0, roofY - 0.3, fixture.position.z])
    const stripFrom = sternZ + 0.6
    const stripTo = 0.8 * sz
    const strips = [-1, 1].map((side) => {
        const a = new THREE.Vector3(side * (innerHalf(stripFrom) - 0.02), deckY + 0.3, stripFrom)
        const b = new THREE.Vector3(side * (innerHalf(stripTo) - 0.02), deckY + 0.3, stripTo)
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, a.distanceTo(b)), LIGHTS_OFF)
        strip.userData.keep = true
        strip.position.addVectors(a, b).multiplyScalar(0.5)
        strip.rotation.y = Math.atan2(b.x - a.x, b.z - a.z)
        group.add(strip)
        return strip
    })

    // Fishing gear: three rod holders per side on the gunwale, the tub on the aft deck
    const holders = []
    for (const side of [1, -1]) {
        for (const z of [sternZ + 0.95, sternZ + 1.9, sternZ + 2.85]) {
            holders.push({ position: new THREE.Vector3(side * (innerHalf(z) + outerHalf(z)) / 2, gunwaleTop, z), side })
        }
    }
    const tubZ = sternZ + 1.45
    root.userData.fishing = buildFishingGear(root, { holders, tub: new THREE.Vector3(0, deckY, tubZ) })
    block(0, tubZ, 0.45, 0.32)

    addLid(root, sx, sz, rimTop)

    return {
        y: deckY,
        outline,
        obstacles,
        seats,
        helm: { x: helm.x, z: helm.z, angle: helm.angle, wheel: spin, lever },
        canopyMaterial,
        lights: { lamps, glowing: [...fixtures, ...strips, lightButton], on: LIGHTS_ON, off: LIGHTS_OFF }
    }
}

// Collider half extents for a boat definition
export function boatHalfExtents(size) {
    return { x: size.width / 2, y: (size.height / NOMINAL.height) * 0.5, z: (size.length / NOMINAL.length) * 2.5 }
}

// Where the pilot's eyes are, for the first person camera (boat local space).
// Seated amidships on open boats (ahead of the cargo), standing behind the
// console, or up on the flybridge over the cabin roof so you can see ahead.
export function eyeOffset(definition) {
    if (OPEN_DECK.includes(definition.layout)) {
        const helm = definition.layout === 'ferry' ? ferryHelm(definition.size) : fishingHelm(definition.size)
        return [helm.x, helm.deckY + 1.62, helm.z]
    }
    const eye = {
        open: [0, 1.5, -0.15],
        console: [0, 1.85, -0.9],
        cabin: [0, 2.35, -0.2]
    }[definition.layout] ?? [0, 1.5, -0.15]
    const { size } = definition
    return [
        eye[0] * (size.width / NOMINAL.width),
        eye[1] * (size.height / NOMINAL.height),
        eye[2] * (size.length / NOMINAL.length)
    ]
}

// Wheel (`spin` turns with the steering), throttle lever and lights switch on
// the aft face of a helm console centered at x, whose aft face is at aftZ
function addHelmControls(group, add, consoleX, deckY, aftZ) {
    const dark = colorMaterial('#1d1f26')
    const metal = colorMaterial('#c8ccd4')
    // Wheel tilted toward the pilot; `spin` turns with the steering
    const wheel = new THREE.Group()
    wheel.userData.keep = true
    wheel.position.set(consoleX + 0.05, deckY + 0.88, aftZ - 0.06)
    wheel.rotation.x = 0.45
    group.add(wheel)
    const shaft = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 6), metal), wheel)
    shaft.rotation.x = Math.PI / 2
    shaft.position.z = 0.07
    const spin = new THREE.Group()
    wheel.add(spin)
    add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 6, 18), dark), spin)
    const hub = add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 8), metal), spin)
    hub.rotation.x = Math.PI / 2
    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2
        const spoke = add(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.17, 0.02), metal), spin)
        spoke.position.set(Math.sin(angle) * 0.1, Math.cos(angle) * 0.1, 0)
        spoke.rotation.z = -angle
    }

    // Throttle: a lever on a small box, pushed forward to go ahead
    const binnacle = add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.22), metal))
    binnacle.position.set(consoleX - 0.25, deckY + 1.09, aftZ + 0.17)
    const lever = new THREE.Group()
    lever.userData.keep = true
    lever.position.set(consoleX - 0.25, deckY + 1.13, aftZ + 0.17)
    group.add(lever)
    const stick = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.03), dark), lever)
    stick.position.y = 0.12
    const knob = add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), colorMaterial('#e63946')), lever)
    knob.position.y = 0.25

    // Cabin lights switch on the dash, left of the wheel: its button glows
    // with the lights (its material is swapped)
    const switchPlate = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.12), metal))
    switchPlate.position.set(consoleX + 0.24, deckY + 1.055, aftZ + 0.13)
    const lightButton = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), LIGHTS_OFF)
    lightButton.userData.keep = true
    lightButton.position.set(consoleX + 0.24, deckY + 1.085, aftZ + 0.13)
    group.add(lightButton)

    return { spin, lever, lightButton }
}

// Outboard motors hanging from the transom of an open hull (real meters)
function addOutboards(definition, add, rimTop, transomZ) {
    const dark = colorMaterial('#1d1f26')
    const { colors } = definition
    const motorX = [[], [0], [-0.45, 0.45], [-0.75, 0, 0.75]][definition.motors]
    for (const x of motorX) {
        const cowling = add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.62, 0.6), dark))
        cowling.position.set(x, rimTop + 0.12, transomZ - 0.32)
        const cap = add(new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.06, 0.62), colorMaterial(colors.stripe)))
        cap.position.set(x, rimTop + 0.45, transomZ - 0.32)
        const leg = add(new THREE.Mesh(new THREE.BoxGeometry(0.14, rimTop + 0.75, 0.22), dark))
        leg.position.set(x, (rimTop - 0.75) / 2 - 0.2, transomZ - 0.3)
        const fin = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.4), dark))
        fin.position.set(x, -0.9, transomZ - 0.3)
    }
}

// Invisible lid over the open hull, at the gunwale. It's drawn after the
// boat but before the (transparent) water and only writes depth, so waves
// higher than the deck never show through the floor
function addLid(root, sx, sz, rimTop) {
    const lidShape = new THREE.Shape(DECK_OUTLINE.map(([x, z]) => new THREE.Vector2(x * sx, z * sz)))
    const lidGeometry = new THREE.ShapeGeometry(lidShape)
    lidGeometry.rotateX(Math.PI / 2)
    const lid = new THREE.Mesh(lidGeometry, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }))
    lid.position.y = rimTop - 0.02
    lid.renderOrder = 10
    root.add(lid)
}
