import * as THREE from 'three/webgpu'
import { applyAnchor, applyBuoyancy, floatPoints } from './floating.js'

const _position = new THREE.Vector3()
const _quaternion = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _euler = new THREE.Euler()

// Everything one world build created: scene objects, physics bodies and
// per-frame updaters. dispose() removes all of it, so the world can be
// rebuilt live when a data file changes without leaks or duplicate colliders.
//
// Collider spec, in the local space of the object it belongs to:
//   { shape: 'ball', radius, position: [x, y, z] }
//   { shape: 'cuboid', size: [halfX, halfY, halfZ], position, angle (deg) }
//   { shape: 'cylinder', radius, halfHeight, position }
//
// Three kinds of bodies:
//   fixed      addCollider(spec, parent): never moves (rocks, docks, sheds…)
//   kinematic  addCollider({ ...spec, follow: object3D }): moves with an
//              animated object (zone buoys, the boat on the travel lift…)
//   dynamic    addDynamic(prop): real physics, pushed by the boat, floats on
//              the waves, optionally anchored (barrels, crates, buoys…)
export class Build {
    constructor({ scene, physics }) {
        this.scene = scene
        this.physics = physics
        this.objects = []
        this.bodies = []
        this.updaters = []
        // Kinematic bodies glued to animated objects: [{ body, object }]
        this.followers = []
        // Dynamic bodies driving their object: [{ body, object, points, depth, anchor… }]
        this.dynamics = []
        // Interactive areas: { x, z, radius, payload, update(time, inside) }
        this.zones = []
    }

    add(object) {
        this.scene.add(object)
        this.objects.push(object)
    }

    addZone(zone) {
        this.zones.push(zone)
    }

    onUpdate(callback) {
        this.updaters.push(callback)
    }

    // Every physics substep: water and mooring forces on dynamic bodies
    step(dt, time) {
        for (const entry of this.dynamics) {
            // Pose before this step, to draw between steps (see update)
            const t = entry.body.translation()
            const r = entry.body.rotation()
            entry.previous.position.set(t.x, t.y, t.z)
            entry.previous.quaternion.set(r.x, r.y, r.z, r.w)
            if (entry.points) applyBuoyancy(entry, dt, time)
            if (entry.anchor) applyAnchor(entry, dt)
        }
    }

    // Every frame
    update(time) {
        for (const callback of this.updaters) callback(time)

        // Kinematic colliders go where their animated object is now
        for (const { body, object } of this.followers) {
            object.updateWorldMatrix(true, false)
            object.matrixWorld.decompose(_position, _quaternion, _scale)
            body.setNextKinematicTranslation(_position)
            body.setNextKinematicRotation(_quaternion)
        }

        // Dynamic objects go where the physics put them, interpolated between
        // the last two steps so they move smoothly at any frame rate
        const alpha = this.physics.alpha
        for (const { body, object, previous } of this.dynamics) {
            const translation = body.translation()
            const rotation = body.rotation()
            object.position.set(translation.x, translation.y, translation.z)
            _quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
            object.position.lerpVectors(previous.position, object.position, alpha)
            object.quaternion.slerpQuaternions(previous.quaternion, _quaternion, alpha)
        }
    }

    createColliderDesc(spec, scale) {
        const { RAPIER } = this.physics
        const horizontal = Math.max(scale.x, scale.z)
        if (spec.shape === 'ball') return RAPIER.ColliderDesc.ball(spec.radius * horizontal)
        if (spec.shape === 'cylinder') return RAPIER.ColliderDesc.cylinder(spec.halfHeight * scale.y, spec.radius * horizontal)
        return RAPIER.ColliderDesc.cuboid(spec.size[0] * scale.x, spec.size[1] * scale.y, spec.size[2] * scale.z)
    }

    // Collider placed relative to its body (used by kinematic and dynamic bodies)
    attachCollider(spec, scale, body, extra = {}) {
        const desc = this.createColliderDesc(spec, scale)
        const [x, y, z] = spec.position ?? [0, 0, 0]
        desc.setTranslation(x * scale.x, y * scale.y, z * scale.z)
        if (spec.angle) {
            const half = THREE.MathUtils.degToRad(spec.angle) / 2
            desc.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) })
        }
        desc.setFriction(extra.friction ?? 0.2)
        if (extra.mass !== undefined) desc.setMass(extra.mass)
        if (extra.restitution !== undefined) desc.setRestitution(extra.restitution)
        this.physics.world.createCollider(desc, body)
    }

    addCollider(spec, parent) {
        if (spec.follow) return this.addFollower(spec)
        parent.updateWorldMatrix(true, false)
        parent.matrixWorld.decompose(_position, _quaternion, _scale)
        const position = new THREE.Vector3(...(spec.position ?? [0, 0, 0])).applyMatrix4(parent.matrixWorld)
        _euler.setFromQuaternion(_quaternion, 'YXZ')
        const yaw = _euler.y + THREE.MathUtils.degToRad(spec.angle ?? 0)

        const { RAPIER, world } = this.physics
        const body = world.createRigidBody(
            RAPIER.RigidBodyDesc.fixed()
                .setTranslation(position.x, position.y, position.z)
                .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
        )
        world.createCollider(this.createColliderDesc(spec, _scale).setFriction(0.2), body)
        this.bodies.push(body)
    }

    addFollower(spec) {
        const object = spec.follow
        object.updateWorldMatrix(true, false)
        object.matrixWorld.decompose(_position, _quaternion, _scale)
        const { RAPIER, world } = this.physics
        const body = world.createRigidBody(
            RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(_position.x, _position.y, _position.z).setRotation(_quaternion)
        )
        this.attachCollider(spec, _scale, body)
        this.bodies.push(body)
        this.followers.push({ body, object })
    }

    // Turns a placed prop into a free physics object. It leaves its (merged)
    // parent group and is driven by its body from then on.
    //   options: { mass, floatDepth, anchor: { slack }, restitution, friction }
    addDynamic(prop) {
        const { object, colliders } = prop
        const options = prop.body
        this.scene.attach(object)
        this.objects.push(object)
        object.updateWorldMatrix(true, false)
        object.matrixWorld.decompose(_position, _quaternion, _scale)
        const scale = _scale.clone()

        const { RAPIER, world } = this.physics
        const body = world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(_position.x, _position.y, _position.z)
                .setRotation(_quaternion)
                .setLinearDamping(0.1)
                .setAngularDamping(0.4)
        )
        const mass = options.mass ?? 1
        for (const spec of colliders) {
            this.attachCollider(spec, scale, body, {
                mass: mass / colliders.length,
                restitution: options.restitution ?? 0.25,
                friction: options.friction ?? 0.5
            })
        }

        this.bodies.push(body)
        this.dynamics.push({
            body,
            object,
            previous: { position: _position.clone(), quaternion: _quaternion.clone() },
            mass,
            scale,
            depth: options.floatDepth ?? 0.3,
            points: options.floatDepth === 0 ? null : floatPoints(object, colliders),
            anchor: options.anchor ? { x: _position.x, z: _position.z, slack: options.anchor.slack ?? 1.5 } : null
        })
    }

    dispose() {
        for (const object of this.objects) {
            object.removeFromParent()
            object.traverse((child) => {
                child.geometry?.dispose()
                const list = Array.isArray(child.material) ? child.material : [child.material]
                for (const material of list) {
                    // Shared palette materials stay alive, per-object ones (labels, zones) go
                    if (material?.userData.disposable) {
                        material.map?.dispose()
                        material.dispose()
                    }
                }
            })
        }
        for (const body of this.bodies) this.physics.world.removeRigidBody(body)
        this.objects = []
        this.bodies = []
        this.updaters = []
        this.followers = []
        this.dynamics = []
        this.zones = []
    }
}
