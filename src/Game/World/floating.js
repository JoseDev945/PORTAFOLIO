import * as THREE from 'three/webgpu'
import { waveHeight } from './Waves.js'

const _quaternion = new THREE.Quaternion()
const _relative = new THREE.Vector3()
const _point = new THREE.Vector3()

// Points used to sample the water, in the object's local space: spread
// horizontally over its footprint, at the height of its center of mass
// (the middle of its colliders, not of its model: a boat's canopy would
// make it sit too deep).
// They must not be below the center of mass: lift pushing from under the
// center is unstable (like balancing a pencil) and flips the object over.
// At center height, the side that dips gets more lift and rights it.
export function floatPoints(object, colliders) {
    object.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(object)
    const inset = 0.2
    const xs = [THREE.MathUtils.lerp(box.min.x, box.max.x, inset), THREE.MathUtils.lerp(box.min.x, box.max.x, 1 - inset)]
    const zs = [THREE.MathUtils.lerp(box.min.z, box.max.z, inset), THREE.MathUtils.lerp(box.min.z, box.max.z, 1 - inset)]
    const center = box.getCenter(new THREE.Vector3())
    const points = [new THREE.Vector3(center.x, 0, center.z)]
    for (const x of xs) for (const z of zs) points.push(new THREE.Vector3(x, 0, z))

    const centerY = colliders.reduce((sum, spec) => sum + (spec.position?.[1] ?? 0), 0) / Math.max(1, colliders.length)
    return points.map((point) => {
        // Footprint from the model (world space), height from the colliders (local space)
        const local = object.worldToLocal(point)
        local.y = centerY
        return local
    })
}

// Same spring model as the player's boat: each submerged point pushes up in
// proportion to its depth, so the object settles `depth` under the surface,
// rolls with the waves and rights itself.
export function applyBuoyancy(entry, dt, time) {
    const { body, points, scale, mass, depth } = entry
    const translation = body.translation()
    const rotation = body.rotation()
    const linvel = body.linvel()
    const angvel = body.angvel()
    _quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)

    const stiffness = (mass * 9.81) / (points.length * depth)
    const damping = (mass * 1.6) / points.length
    let submerged = 0
    for (const local of points) {
        _relative.copy(local).multiply(scale).applyQuaternion(_quaternion)
        _point.copy(_relative).add(translation)
        const immersion = waveHeight(_point.x, _point.z, time) - _point.y
        if (immersion <= 0) continue
        submerged++
        const pointVelocityY = linvel.y + angvel.z * _relative.x - angvel.x * _relative.z
        const lift = (stiffness * Math.min(immersion, depth * 3) - damping * pointVelocityY) * dt
        body.applyImpulseAtPoint({ x: 0, y: lift, z: 0 }, _point, true)
    }

    if (submerged === 0) return
    // Water resistance: slows drifting and spinning
    const inWater = submerged / points.length
    body.applyImpulse({ x: -linvel.x * mass * 0.8 * dt * inWater, y: 0, z: -linvel.z * mass * 0.8 * dt * inWater }, true)
    const spin = -mass * 0.6 * dt * inWater
    body.applyTorqueImpulse({ x: angvel.x * spin, y: angvel.y * spin, z: angvel.z * spin }, true)
}

// Mooring line: free within `slack` meters, then pulled back to its spot
export function applyAnchor(entry, dt) {
    const { body, anchor, mass } = entry
    const translation = body.translation()
    const dx = anchor.x - translation.x
    const dz = anchor.z - translation.z
    const distance = Math.hypot(dx, dz)
    if (distance <= anchor.slack) return
    const pull = (distance - anchor.slack) * mass * 2.5 * dt
    body.applyImpulse({ x: (dx / distance) * pull, y: 0, z: (dz / distance) * pull }, true)
}
