import { createBoatMesh, boatHalfExtents, resolveBoat } from '../../Boat/BoatMesh.js'

// A moored boat (any type from data/boats.js). Floats like the player's boat,
// can be bumped around, and its mooring line brings it back.
export default {
    description: 'Barco anclado (física: flota y se puede empujar)',
    body: { type: 'dynamic', mass: 6, floatDepth: 0.35, anchor: { slack: 2.5 } },
    schema: {
        model: { type: 'string', default: 'lancha' }
    },
    create({ params, content, warn }) {
        const definition = resolveBoat(content.boats, params.model, 'model', warn)
        const object = createBoatMesh(definition)
        const half = boatHalfExtents(definition.size)
        return {
            object,
            colliders: [{ shape: 'cuboid', size: [half.x, half.y, half.z] }],
            // Same weight as when you sail it
            body: { mass: definition.physics.mass }
        }
    }
}
