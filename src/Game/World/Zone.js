import * as THREE from 'three/webgpu'
import { waveHeight } from './Waves.js'
import { colorMaterial, shadow } from './materials.js'

const RADIUS = 4.5
const _position = new THREE.Vector3()

// Dashed ring + buoy marking an interactive area (project card, boat showroom...)
export function createZone(accent, radius = RADIUS) {
    const group = new THREE.Group()
    const dashMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 })
    dashMaterial.userData.disposable = true
    const dashCount = 28
    const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.06, 0.6), dashMaterial, dashCount)
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < dashCount; i++) {
        const angle = (i / dashCount) * Math.PI * 2
        matrix.makeRotationY(-angle)
        matrix.setPosition(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
        dashes.setMatrixAt(i, matrix)
    }
    group.add(dashes)

    const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 1.4, 8), colorMaterial(accent)))
    body.position.y = 0.3
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), colorMaterial(accent, true))
    light.position.y = 1.2
    group.add(body, light)

    return {
        object: group,
        radius,
        update(time, active) {
            group.position.y = waveHeight(group.position.x, group.position.z, time) + 0.25
            group.rotation.y = time * (active ? 0.6 : 0.15)
            dashMaterial.color.set(active ? accent : '#ffffff')
        }
    }
}

// The buoy in the middle of a zone, bobbing with it
export function addMarkerCollider(build, marker) {
    build.addCollider({ shape: 'cylinder', radius: 0.65, halfHeight: 0.9, position: [0, 0.4, 0], follow: marker.object })
}

// Props can declare zones in their local space:
//   zones: [{ position: [x, y, z], radius, accent, payload }]
// This places their rings in the world and registers them in the build.
export function placePropZones(build, prop) {
    if (!prop.zones?.length) return
    prop.object.updateWorldMatrix(true, false)
    for (const zone of prop.zones) {
        _position.set(...(zone.position ?? [0, 0, 0]))
        prop.object.localToWorld(_position)
        const marker = createZone(zone.accent ?? '#ffb347', zone.radius ?? RADIUS)
        marker.object.position.set(_position.x, 0, _position.z)
        build.add(marker.object)
        addMarkerCollider(build, marker)
        build.addZone({ x: _position.x, z: _position.z, radius: marker.radius, payload: zone.payload, update: marker.update })
    }
}
