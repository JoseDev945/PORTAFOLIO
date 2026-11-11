import * as THREE from 'three/webgpu'

// Surfaces someone on foot can walk on, in world space:
//   { shape: 'disc', x, z, radius, y }                    island ground
//   { shape: 'box', x, z, angle, halfX, halfZ, y }        docks, the marina
// `angle` is the yaw in radians (like object.rotation.y), `y` the floor
// height and `reach` a bounding radius used to skip far surfaces quickly.
//
// Props declare theirs in local space (and, at the marina, the boat berths):
//   walkable: [{ size: [halfX, halfZ], position: [x, y, z], angle (deg) }]
//   berths:   [{ position: [x, z], angle (deg) }]   stern of a moored boat, bow along +z
//   stations: [{ position: [x, z], radius, payload }] a shop counter: on foot within
//             radius, F triggers 'station' with the payload ({ shop, label })

const _position = new THREE.Vector3()
const _quaternion = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _euler = new THREE.Euler()

export function discSurface(x, z, radius, y) {
    return { shape: 'disc', x, z, radius, y, reach: radius }
}

export function boxSurface(x, z, angle, halfX, halfZ, y) {
    return { shape: 'box', x, z, angle, halfX, halfZ, y, reach: Math.hypot(halfX, halfZ) }
}

// Places a prop's walkable surfaces and berths in the world and registers them
export function placePropSurfaces(build, prop) {
    if (!prop.walkable?.length && !prop.berths?.length && !prop.stations?.length) return
    prop.object.updateWorldMatrix(true, false)
    prop.object.matrixWorld.decompose(_position, _quaternion, _scale)
    const yaw = _euler.setFromQuaternion(_quaternion, 'YXZ').y
    for (const surface of prop.walkable ?? []) {
        _position.set(...surface.position).applyMatrix4(prop.object.matrixWorld)
        const angle = yaw + THREE.MathUtils.degToRad(surface.angle ?? 0)
        build.addWalkable(boxSurface(_position.x, _position.z, angle, surface.size[0] * _scale.x, surface.size[1] * _scale.z, _position.y))
    }
    for (const berth of prop.berths ?? []) {
        _position.set(berth.position[0], 0, berth.position[1]).applyMatrix4(prop.object.matrixWorld)
        build.berths.push({ x: _position.x, z: _position.z, angle: yaw + THREE.MathUtils.degToRad(berth.angle ?? 0) })
    }
    for (const station of prop.stations ?? []) {
        _position.set(station.position[0], 0, station.position[1]).applyMatrix4(prop.object.matrixWorld)
        build.stations.push({ x: _position.x, z: _position.z, radius: station.radius ?? 2, payload: station.payload })
    }
}

// The highest surface under (x, z), at least `margin` inside its edges, or null
export function surfaceAt(surfaces, x, z, margin = 0) {
    let best = null
    for (const surface of surfaces) {
        const dx = x - surface.x
        const dz = z - surface.z
        if (dx * dx + dz * dz > surface.reach * surface.reach) continue
        if (surface.shape === 'disc') {
            if (Math.hypot(dx, dz) > surface.radius - margin) continue
        } else {
            // World -> surface local (inverse yaw)
            const cos = Math.cos(surface.angle)
            const sin = Math.sin(surface.angle)
            const localX = dx * cos - dz * sin
            const localZ = dx * sin + dz * cos
            if (Math.abs(localX) > surface.halfX - margin || Math.abs(localZ) > surface.halfZ - margin) continue
        }
        if (!best || surface.y > best.y) best = surface
    }
    return best
}
