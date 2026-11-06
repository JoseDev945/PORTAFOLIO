import * as THREE from 'three/webgpu'
import { waveHeight } from '../World/Waves.js'
import { Game } from '../Game.js'
import { TickOrder } from '../Ticker.js'
import { createBoatMesh, boatHalfExtents, resolveBoat, eyeOffset } from './BoatMesh.js'

const IDLE_CONTROLS = { throttle: 0, steer: 0, boost: false }

const _quaternion = new THREE.Quaternion()
const _point = new THREE.Vector3()
const _relative = new THREE.Vector3()
const _velocity = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()

// The player's boat. Its look and handling come from data/boats.js (the type
// is chosen with playerBoat in data/world.js) and update live when those
// files change.
export class Boat {
    constructor() {
        this.game = Game.getInstance()
        this.spawn = new THREE.Vector3()

        const { RAPIER, world } = this.game.physics
        this.body = world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic()
                .setLinearDamping(0.05)
                .setAngularDamping(1.5)
                .setCanSleep(false)
        )
        this.state = { speed: 0, submerged: 0, throttle: 0 }
        this.upsideDownTime = 0

        this.applyContent()
        this.respawn()
        this.game.view.snap(this.spawn)

        this.game.events.on('world:build', () => this.applyContent())
        this.game.events.on('settings:change', (key) => key === 'boat' && this.applyContent())
        // Pose before the latest physics step: the mesh is drawn between it and the
        // current one (interpolation), so it moves smoothly even when frames and
        // the 60 Hz physics steps don't line up
        this.previous = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
        this.current = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
        this.storePose(this.previous)
        this.game.physics.onStep((dt, time) => {
            this.storePose(this.previous)
            // The controls drive the boat only while someone is at the helm
            const driving = this.game.playing && this.game.character?.driving !== false
            this.applyForces(dt, time, driving ? this.game.inputs : IDLE_CONTROLS)
        })
        this.game.ticker.on(() => this.update(this.game.ticker.gameDelta), TickOrder.BOAT)
        this.setDebug()
    }

    // Reads the boat type and spawn point from the content
    applyContent() {
        const { content, world, diagnostics } = this.game
        const spawn = world.spawn
        this.spawn.set(spawn.x, 1, spawn.z)
        this.spawnAngle = THREE.MathUtils.degToRad(spawn.angle)

        // The boat picked at the showroom wins, as long as it still exists
        const chosen = this.game.settings.get('boat')
        const id = chosen && content.boats?.[chosen] ? chosen : world.playerBoat
        const definition = resolveBoat(content.boats, id, 'world.playerBoat', (message) => diagnostics.warn(message))
        const key = JSON.stringify(definition)
        if (key === this.definitionKey) return
        this.definitionKey = key
        this.setDefinition(definition)
    }

    setDefinition(definition) {
        this.definition = definition
        // Live object: the debug panel edits it directly
        this.params = definition.physics

        // Model
        if (this.mesh) this.mesh.removeFromParent()
        this.mesh = createBoatMesh(definition)
        this.game.rendering.scene.add(this.mesh)

        // Collider with explicit mass properties: a low center of mass
        // (heavy keel and motor) keeps the boat upright
        const { RAPIER, world } = this.game.physics
        if (this.collider) world.removeCollider(this.collider, true)
        const half = boatHalfExtents(definition.size)
        // Hull half sizes, also used by the spray and the wake
        this.half = half
        // Pilot's eyes for the first person camera
        this.eye = eyeOffset(definition)
        // Where the eyes look, relative to the bow (the character turns it)
        this.eyeYaw = 0
        this.mass = this.params.mass
        const w = half.x * 2
        const h = half.y * 2
        const l = half.z * 2
        const inertia = {
            x: (this.mass * (h * h + l * l)) / 12,
            y: (this.mass * (w * w + l * l)) / 12,
            z: (this.mass * (w * w + h * h)) / 12
        }
        this.yawInertia = inertia.y
        this.collider = world.createCollider(
            RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
                .setMassProperties(this.mass, { x: 0, y: -half.y * 0.9, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 })
                .setFriction(0.3)
                .setRestitution(0.2),
            this.body
        )

        // Hull points sampled against the wave surface for buoyancy (body local space)
        const fx = half.x * 0.82
        const fz = half.z
        const y = -half.y * 0.9
        this.floatPoints = [
            [-fx, y, -fz * 0.84], [fx, y, -fz * 0.84],
            [-fx, y, fz * 0.36], [fx, y, fz * 0.36],
            [0, y, fz * 0.92], [0, y, -fz * 0.24]
        ].map(([px, py, pz]) => new THREE.Vector3(px, py, pz))
        this.sternPoint = new THREE.Vector3(0, y, -fz - 0.1)
        this.game.events.trigger('boat:change')
    }

    setDebug() {
        this.game.debug.add((pane) => {
            const folder = pane.addFolder({ title: '⛵ Bote' })
            // Bindings read this.params on every change, so they keep working after a rebuild
            const proxy = {}
            for (const [key, max] of Object.entries({ power: 40, boostPower: 60, turn: 8, forwardDrag: 3, lateralDrag: 10, floatDepth: 1, verticalDamping: 5 })) {
                Object.defineProperty(proxy, key, { get: () => this.params[key], set: (value) => (this.params[key] = value) })
                folder.addBinding(proxy, key, { min: key === 'floatDepth' ? 0.1 : 0, max })
            }
        })
    }

    storePose(target) {
        const translation = this.body.translation()
        const rotation = this.body.rotation()
        target.position.set(translation.x, translation.y, translation.z)
        target.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
    }

    respawn() {
        this.place(this.spawn.x, this.spawn.z, this.spawnAngle ?? 0)
    }

    // Teleport (map): the boat appears there, still, facing `angle`
    teleport(x, z, angle) {
        this.place(x, z, angle)
        this.game.view.snap({ x, z })
    }

    place(x, z, angle) {
        this.body.setTranslation({ x, y: this.spawn.y, z }, true)
        this.body.setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) }, true)
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
        // No interpolation across a teleport
        if (this.previous) this.storePose(this.previous)
    }

    // Called once per physics substep
    applyForces(dt, time, inputs) {
        const body = this.body
        const translation = body.translation()
        const rotation = body.rotation()
        const linvel = body.linvel()
        const angvel = body.angvel()
        _quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)

        // Buoyancy + vertical damping at each hull point
        const pointStiffness = (this.mass * 9.81) / (this.floatPoints.length * this.params.floatDepth)
        const pointDamping = (this.mass * this.params.verticalDamping) / this.floatPoints.length
        let submerged = 0
        for (const local of this.floatPoints) {
            _relative.copy(local).applyQuaternion(_quaternion)
            _point.copy(_relative).add(translation)
            const depth = waveHeight(_point.x, _point.z, time) - _point.y
            if (depth <= 0) continue
            submerged++

            // Velocity of the point = linear + angular x relative
            _velocity.set(
                linvel.x + angvel.y * _relative.z - angvel.z * _relative.y,
                linvel.y + angvel.z * _relative.x - angvel.x * _relative.z,
                linvel.z + angvel.x * _relative.y - angvel.y * _relative.x
            )
            const lift = (pointStiffness * Math.min(depth, 1.2) - pointDamping * _velocity.y) * dt
            body.applyImpulseAtPoint({ x: 0, y: lift, z: 0 }, _point, true)
        }
        const inWater = submerged / this.floatPoints.length
        this.state.submerged = inWater

        _forward.set(0, 0, 1).applyQuaternion(_quaternion)
        _right.set(-1, 0, 0).applyQuaternion(_quaternion)
        const forwardSpeed = linvel.x * _forward.x + linvel.y * _forward.y + linvel.z * _forward.z
        const lateralSpeed = linvel.x * _right.x + linvel.y * _right.y + linvel.z * _right.z
        this.state.speed = forwardSpeed

        if (inWater === 0) return

        // Water drag: weak forward, strong sideways (acts like a keel)
        const dragForward = -forwardSpeed * this.params.forwardDrag * this.mass * dt * inWater
        const dragLateral = -lateralSpeed * this.params.lateralDrag * this.mass * dt * inWater
        body.applyImpulse({
            x: _forward.x * dragForward + _right.x * dragLateral,
            y: 0,
            z: _forward.z * dragForward + _right.z * dragLateral
        }, true)

        // Extra roll/pitch damping from the water around the hull
        const rollDamping = -this.yawInertia * 2.5 * dt * inWater
        body.applyTorqueImpulse({ x: angvel.x * rollDamping, y: 0, z: angvel.z * rollDamping }, true)

        // Propeller at the stern (applied at the center of mass so it never flips the boat)
        const throttle = inputs.throttle
        this.state.throttle = throttle
        _point.copy(this.sternPoint).applyQuaternion(_quaternion).add(translation)
        const sternInWater = waveHeight(_point.x, _point.z, time) > _point.y - 0.3
        if (throttle !== 0 && sternInWater) {
            const power = (inputs.boost && throttle > 0 ? this.params.boostPower : this.params.power) * (throttle < 0 ? 0.5 : 1)
            const thrust = throttle * power * this.mass * dt
            // Flatten thrust onto the horizontal plane so waves don't launch the boat
            const length = Math.hypot(_forward.x, _forward.z) || 1
            body.applyImpulse({ x: (_forward.x / length) * thrust, y: 0, z: (_forward.z / length) * thrust }, true)
        }

        // Rudder: turning needs water flow, but allow some turning at idle
        const steer = inputs.steer
        if (steer !== 0) {
            const flow = Math.max(0.35, Math.min(1, Math.abs(forwardSpeed) / 5))
            const direction = forwardSpeed < -0.5 ? -1 : 1
            // Player preference from the pause menu (0.5 soft … 1.5 sharp)
            const sensitivity = this.game.settings.get('steering')
            const torque = steer * this.params.turn * sensitivity * flow * direction * this.yawInertia * dt * inWater
            body.applyTorqueImpulse({ x: 0, y: torque, z: 0 }, true)
        }
    }

    update(delta) {
        if (delta === 0) return
        const translation = this.body.translation()
        this.storePose(this.current)
        const alpha = this.game.physics.alpha
        this.mesh.position.lerpVectors(this.previous.position, this.current.position, alpha)
        this.mesh.quaternion.slerpQuaternions(this.previous.quaternion, this.current.quaternion, alpha)

        // Auto respawn when capsized or lost
        _up.set(0, 1, 0).applyQuaternion(this.mesh.quaternion)
        this.upsideDownTime = _up.y < 0.2 ? this.upsideDownTime + delta : 0
        if (this.upsideDownTime > 2.5 || translation.y < -10) {
            this.upsideDownTime = 0
            this.respawn()
        }

        // Soft world boundary
        const distance = Math.hypot(translation.x, translation.z)
        if (distance > 150) {
            const push = (distance - 150) * this.mass * 0.05
            this.body.applyImpulse({ x: (-translation.x / distance) * push, y: 0, z: (-translation.z / distance) * push }, true)
        }
    }
}
