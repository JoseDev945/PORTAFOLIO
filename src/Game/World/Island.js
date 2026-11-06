import * as THREE from 'three/webgpu'
import { mergeByMaterial } from '../utils/merge.js'
import { random } from '../utils/random.js'
import { materials, shadow } from './materials.js'
import { createProp } from './props/index.js'
import { createLabel } from './Label.js'
import { createZone, placePropZones, addMarkerCollider } from './Zone.js'

// Validation rules for an island in data/world.js
export const ISLAND_SCHEMA = {
    id: { type: 'string', required: true, default: 'isla' },
    x: { type: 'number', default: 0 },
    z: { type: 'number', default: 0 },
    radius: { type: 'number', default: 8, min: 3, max: 40 },
    seed: { type: 'number', default: 1, integer: true },
    // Top surface: grass, or concrete for a yard / town
    ground: { type: 'enum', values: ['grass', 'concrete', 'sand'], default: 'grass' },
    project: { type: 'string', nullable: true, default: null },
    palms: { type: 'number', default: 3, min: 0, max: 40, integer: true },
    rocks: { type: 'number', default: 3, min: 0, max: 40, integer: true },
    shoreRocks: { type: 'number', default: 4, min: 0, max: 40, integer: true },
    // Glowing Pandora style plants (null = automatic: by size, none on concrete)
    flora: { type: 'number', nullable: true, default: null, min: 0, max: 80, integer: true },
    dock: {
        type: 'object',
        nullable: true,
        default: { angle: null, length: 7 },
        schema: {
            // null = facing the start island
            angle: { type: 'number', nullable: true, default: null },
            length: { type: 'number', default: 7, min: 2, max: 40 }
        }
    },
    props: { type: 'array', default: [] }
}

const GRASS_Y = 1

function jitter(geometry, seed, amount) {
    // Radial offset derived from the vertex position (not from a sequence) so
    // duplicated vertices on seams and caps move together and the mesh stays closed
    const position = geometry.attributes.position
    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i)
        const y = position.getY(i)
        const z = position.getZ(i)
        if (Math.hypot(x, z) < 0.01) continue
        const hash = Math.sin(Math.atan2(z, x) * 12.9898 + y * 0.5 * 78.233 + seed) * 43758.5453
        const scale = 1 + (hash - Math.floor(hash) - 0.5) * amount
        position.setX(i, x * scale)
        position.setZ(i, z * scale)
    }
    return geometry
}

const angularDistance = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)

// Builds one island from its (already validated) data into `build`.
// Random decoration and hand placed props both go through the props catalog.
export function buildIsland(island, project, path, { build, content, warn, error }) {
    const rand = random(island.seed)
    const { radius } = island
    const group = new THREE.Group()
    group.position.set(island.x, 0, island.z)

    const colliders = []
    const updaters = []
    const placed = []
    const addProp = (entry, propPath, groundY) => {
        try {
            const prop = createProp(entry, propPath, { warn, content, groundY })
            if (!prop) return
            group.add(prop.object)
            placed.push(prop)
            // Physical props get their own dynamic body later, the rest are fixed
            if (!prop.body) for (const collider of prop.colliders) colliders.push([collider, prop.object])
            if (prop.update) updaters.push((time) => prop.update(time, prop.object))
        } catch (exception) {
            error(`${propPath}: no se pudo crear "${entry?.type}"`, exception)
        }
    }

    // Terrain: sand base + grass cap
    const sand = shadow(new THREE.Mesh(jitter(new THREE.CylinderGeometry(radius * 0.92, radius * 1.08, 3, 14, 2), island.seed, 0.14), materials.sand))
    sand.position.y = -0.9
    const grass = shadow(new THREE.Mesh(jitter(new THREE.CylinderGeometry(radius * 0.68, radius * 0.78, 0.8, 10, 1), island.seed + 1, 0.16), materials[island.ground]))
    grass.position.y = 0.8
    group.add(sand, grass)
    colliders.push([{ shape: 'cylinder', radius: radius * 1.02, halfHeight: 2.6, position: [0, -1.4, 0] }, group])

    // Dock direction: explicit angle, or facing the start island
    const atOrigin = Math.hypot(island.x, island.z) < 0.01
    const autoAngle = atOrigin ? Math.PI / 2 : Math.atan2(-island.z, -island.x)
    const dockAngle = island.dock?.angle != null ? THREE.MathUtils.degToRad(island.dock.angle) : autoAngle
    const dockLength = island.dock ? island.dock.length : 0
    const keepClear = (angle, margin) => island.dock && angularDistance(angle, dockAngle) < margin
    const seed = () => Math.floor(rand() * 1e6)

    // Random decoration (the seed makes it the same on every visit)
    for (let i = 0; i < island.rocks; i++) {
        const angle = rand() * Math.PI * 2
        const distance = radius * (0.4 + rand() * 0.3)
        if (keepClear(angle, 0.6)) continue
        addProp({ type: 'rock', x: Math.cos(angle) * distance, z: Math.sin(angle) * distance, y: 1.2, size: 1 + rand() * 1.5, seed: seed() }, `${path}.rocks`, GRASS_Y)
    }
    for (let i = 0; i < island.shoreRocks; i++) {
        const angle = rand() * Math.PI * 2
        const distance = radius * (1.05 + rand() * 0.25)
        if (keepClear(angle, 0.7)) continue
        addProp({ type: 'rock', x: Math.cos(angle) * distance, z: Math.sin(angle) * distance, y: 0, size: 0.6 + rand() * 0.9, seed: seed() }, `${path}.shoreRocks`, 0)
    }
    for (let i = 0; i < island.palms; i++) {
        const angle = rand() * Math.PI * 2
        const distance = radius * rand() * 0.5
        addProp({ type: 'palm', x: Math.cos(angle) * distance, z: Math.sin(angle) * distance, seed: seed() }, `${path}.palms`, GRASS_Y)
    }

    // Glowing plants, away from the hand placed objects
    const flora = island.flora ?? (island.ground === 'concrete' ? 0 : Math.round(radius * 1.5))
    const taken = island.props.map((entry) => [Number(entry?.x) || 0, Number(entry?.z) || 0])
    for (let i = 0; i < flora; i++) {
        const angle = rand() * Math.PI * 2
        const distance = radius * (0.12 + Math.sqrt(rand()) * 0.46)
        const x = Math.cos(angle) * distance
        const z = Math.sin(angle) * distance
        const plantSeed = seed()
        const size = 0.7 + rand() * 0.6
        if (taken.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2)) continue
        addProp({ type: 'alien-plant', x, z, size, angle: rand() * 360, seed: plantSeed }, `${path}.flora`, GRASS_Y)
    }

    if (island.dock) {
        addProp({
            type: 'dock',
            x: Math.cos(dockAngle) * radius * 0.75,
            z: Math.sin(dockAngle) * radius * 0.75,
            y: 0,
            // The dock prop is built along +z: turn it to point along dockAngle
            angle: 90 - THREE.MathUtils.radToDeg(dockAngle),
            length: dockLength,
            seed: seed()
        }, `${path}.dock`, 0)
    }

    // Hand placed objects, relative to the island center
    island.props.forEach((entry, index) => addProp(entry, `${path}.props[${index}]`, GRASS_Y))

    // Static meshes become one mesh per material (animated props are kept apart)
    mergeByMaterial(group)
    build.add(group)
    for (const [spec, parent] of colliders) build.addCollider(spec, parent)
    for (const prop of placed) placePropZones(build, prop)
    for (const prop of placed) if (prop.body) build.addDynamic(prop)
    build.onUpdate((time) => updaters.forEach((update) => update(time)))

    // Sign, zone and card only for islands with a project
    let zone = null
    if (project) {
        const accent = project.color
        const label = createLabel(project.label ?? project.title, accent)
        label.position.set(island.x, 10, island.z)
        build.add(label)
        build.onUpdate((time) => (label.position.y = 10 + Math.sin(time * 1.5 + island.seed) * 0.3))

        const marker = createZone(accent)
        const distance = island.dock ? radius * 0.75 + dockLength + 5.5 : radius + 5.5
        marker.object.position.set(island.x + Math.cos(dockAngle) * distance, 0, island.z + Math.sin(dockAngle) * distance)
        build.add(marker.object)
        addMarkerCollider(build, marker)
        zone = { x: marker.object.position.x, z: marker.object.position.z, radius: marker.radius }
        build.addZone({ ...zone, payload: { type: 'project', project }, update: marker.update })
    }

    return {
        id: island.id,
        x: island.x,
        z: island.z,
        radius,
        ground: island.ground,
        // Grass top, where fireflies fly over
        top: island.ground === 'concrete' ? null : radius * 0.6,
        project,
        zone
    }
}
