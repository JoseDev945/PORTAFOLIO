import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Bakes every static mesh under `root` into one mesh per material, so a whole
// island (or the boat) costs a handful of draw calls instead of dozens.
// Sprites, lights, meshes with a renderOrder or that only write depth, and
// anything flagged `userData.keep` (with its children, e.g. an animated buoy)
// are left untouched.
export function mergeByMaterial(root, { castShadow = true, receiveShadow = true } = {}) {
    root.updateMatrixWorld(true)
    const inverse = root.matrixWorld.clone().invert()
    const buckets = new Map()
    const toRemove = []

    const visit = (object) => {
        if (object.userData.keep) return
        collect(object)
        for (const child of object.children) visit(child)
    }
    const collect = (object) => {
        if (!object.isMesh || object.isInstancedMesh) return
        // Meshes that must draw in their own order stay apart: e.g. the
        // invisible depth-only lid that keeps the water out of an open hull.
        // Merged, it lost its renderOrder and the boat's inside flickered.
        if (object.renderOrder !== 0 || object.material?.colorWrite === false) return
        const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()
        for (const name of Object.keys(geometry.attributes)) {
            if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name)
        }
        if (!geometry.attributes.uv) {
            geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2))
        }
        geometry.clearGroups()
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld))

        if (!buckets.has(object.material)) buckets.set(object.material, [])
        buckets.get(object.material).push(geometry)
        toRemove.push(object)
    }
    visit(root)

    for (const object of toRemove) object.removeFromParent()

    for (const [material, geometries] of buckets) {
        const mesh = new THREE.Mesh(mergeGeometries(geometries), material)
        mesh.castShadow = castShadow
        mesh.receiveShadow = receiveShadow
        root.add(mesh)
        geometries.forEach((geometry) => geometry.dispose())
    }
}
