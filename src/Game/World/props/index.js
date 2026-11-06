import * as THREE from 'three/webgpu'
import { sanitize } from '../../utils/schema.js'
import { random } from '../../utils/random.js'
import { materials } from '../materials.js'

// Catalog of placeable objects. Every file in this folder is registered
// automatically under its file name: drop `bench.js` here and
// { type: 'bench' } works in data/world.js. No other file to edit.
//
// A prop file exports:
//   export default {
//       description: 'Shown in the editor',
//       schema: { height: { type: 'number', default: 6, min: 2, max: 15 } },
//       animated: false, // true = has an update(), not merged with the island
//       // Real physics (optional): pushed by the boat, floats, can be anchored.
//       // Without it the colliders are fixed. Data can override with physics: 'fixed'.
//       body: { type: 'dynamic', mass: 1.5, floatDepth: 0.3, anchor: { slack: 2 } },
//       create({ params, rand, content, warn }) {
//           return { object, colliders: [...], zones: [...], body: { mass }, update(time, object) {} }
//       }
//   }
const modules = import.meta.glob(['./*.js', '!./index.js'], { eager: true })

export const props = new Map(
    Object.entries(modules).map(([path, module]) => [path.slice(2, -3), module.default])
)

// Fields every prop accepts, on top of its own schema
const PLACEMENT = {
    type: { type: 'string', required: true, default: '' },
    x: { type: 'number', default: 0 },
    z: { type: 'number', default: 0 },
    // null = sits on the ground (water level, or the island's grass)
    y: { type: 'number', nullable: true, default: null },
    // Rotation around the vertical axis, in degrees
    angle: { type: 'number', default: 0 },
    scale: { type: 'number', default: 1, min: 0.1, max: 20 },
    // null = derived from the position, so two palms never look identical
    seed: { type: 'number', nullable: true, default: null, integer: true },
    // auto = what the object type says; fixed = never moves; dynamic = real physics
    physics: { type: 'enum', values: ['auto', 'fixed', 'dynamic'], default: 'auto' }
}

// Builds one prop from its data entry. Returns null (with a warning) instead
// of throwing, so one bad entry never takes the rest of the world down.
export function createProp(entry, path, { warn, content, groundY = 0 }) {
    const definition = props.get(entry?.type)
    if (!definition) {
        warn(`${path}.type: no existe el objeto "${entry?.type}". Disponibles: ${[...props.keys()].join(', ')}`)
        return null
    }

    const params = sanitize({ ...PLACEMENT, ...definition.schema }, entry, path, warn)
    const seed = params.seed ?? Math.round(params.x * 73.856 + params.z * 19.349) + 1
    const result = definition.create({ params, rand: random(seed), materials, content, warn: (message) => warn(`${path}: ${message}`) })

    const object = result.object
    object.position.set(params.x, params.y ?? groundY, params.z)
    object.rotation.y = THREE.MathUtils.degToRad(params.angle)
    object.scale.setScalar(params.scale)
    const dynamic = params.physics === 'dynamic' || (params.physics === 'auto' && definition.body?.type === 'dynamic')
    const body = dynamic ? { ...definition.body, ...result.body } : null
    // Animated and physical objects move on their own: never merged with the island
    if (definition.animated || dynamic) object.userData.keep = true

    return { object, colliders: result.colliders ?? [], zones: result.zones ?? [], update: result.update, body }
}
