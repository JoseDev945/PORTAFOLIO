import * as THREE from 'three/webgpu'
import { Game } from './Game.js'
import { TickOrder } from './Ticker.js'
import { capturePointer } from './utils/pointer.js'

// Camera modes, cycled with C / F5 like Minecraft:
//   overview  fixed-angle follow camera seen from above (Bruno Simon style):
//             it never rotates with the boat, drag pans, wheel zooms
//   behind    third person behind the boat
//   front     third person in front, looking back at the boat
//   first     first person from the helm
// In the boat modes, dragging orbits the camera around the boat and the
// wheel/pinch changes the distance. The view glides back once you drive.
export const CAMERA_MODES = ['overview', 'behind', 'front', 'first']
export const CAMERA_NAMES = {
    overview: 'Vista general',
    behind: 'Tercera persona (atrás)',
    front: 'Tercera persona (adelante)',
    first: 'Primera persona · clic para mirar con el mouse'
}
const FOV = { overview: 40, behind: 60, front: 60, first: 72 }

const _euler = new THREE.Euler()
const _offset = new THREE.Vector3()
const _look = new THREE.Vector3()
const _quaternion = new THREE.Quaternion()
const _yawQuaternion = new THREE.Quaternion()
const _orbitQuaternion = new THREE.Quaternion()
const _up = new THREE.Vector3(0, 1, 0)

// Shortest way between two angles
const lerpAngle = (from, to, t) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t

export class View {
    constructor() {
        this.game = Game.getInstance()
        const canvas = this.game.canvas
        this.canvas = canvas
        this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.5, 2000)
        this.direction = new THREE.Vector3(-0.55, 0.75, -0.65).normalize()
        this.distance = 42
        this.targetDistance = 42
        this.target = new THREE.Vector3()
        // Point the world is centered on (water grid, shadows, clouds…): the boat area
        this.smoothTarget = new THREE.Vector3()

        const saved = this.game.settings.get('camera')
        this.mode = CAMERA_MODES.includes(saved) ? saved : 'overview'
        // Boat modes: smoothed boat heading, orbit offsets from dragging, distance
        // orbit*Target is where the mouse asked to look; orbit* follows it smoothly
        this.chase = {
            yaw: 0, orbitYaw: 0, orbitPitch: 0, orbitYawTarget: 0, orbitPitchTarget: 0,
            distance: 9, targetDistance: 9, look: new THREE.Vector3(), initialized: false
        }

        this.mouseEnabled = this.game.settings.get('mouseCamera')
        this.pan = new THREE.Vector3()
        this.drag = { active: false }
        // Pointers currently pressed on the canvas: one drags the view, two pinch to zoom
        this.pointers = new Map()
        this.pinchDistance = 0
        // Horizontal camera axes, used to turn screen drags into world movement
        this.forward = new THREE.Vector3(-this.direction.x, 0, -this.direction.z).normalize()
        this.right = new THREE.Vector3(-this.forward.z, 0, this.forward.x)

        canvas.addEventListener('wheel', (event) => {
            event.preventDefault()
            this.zoomBy(event.deltaY * 0.03)
        }, { passive: false })

        // First person looks like Minecraft: a click locks the mouse and it
        // turns the view directly, no dragging. Esc frees it (and pauses).
        this.locked = false
        document.addEventListener('pointerlockchange', () => {
            this.locked = document.pointerLockElement === canvas
            if (!this.locked && !this.releasing && this.game.playing && this.mode === 'first') {
                // Esc freed the mouse: open the menu (and ignore that same Esc if it reaches the game)
                this.unlockedAt = performance.now()
                this.game.setPaused(true)
            }
            this.releasing = false
        })
        document.addEventListener('mousemove', (event) => {
            if (!this.locked) return
            const sensitivity = 0.0024
            this.chase.orbitYawTarget -= event.movementX * sensitivity
            this.chase.orbitPitchTarget = THREE.MathUtils.clamp(this.chase.orbitPitchTarget + event.movementY * sensitivity, -1.45, 1.45)
        })
        this.game.events.on('pause', (paused) => paused && this.unlock())

        canvas.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return
            if (this.locked) return
            if (event.pointerType === 'mouse' && this.mode === 'first' && this.mouseEnabled && this.game.playing) {
                this.lock()
                return
            }
            capturePointer(canvas, event.pointerId)
            this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
            this.pinchDistance = this.getPinchDistance()
            this.drag.active = this.mouseEnabled && this.pointers.size === 1
            canvas.classList.toggle('grabbing', this.drag.active)
        })
        canvas.addEventListener('pointermove', (event) => {
            const pointer = this.pointers.get(event.pointerId)
            if (!pointer) return
            const dx = event.clientX - pointer.x
            const dy = event.clientY - pointer.y
            pointer.x = event.clientX
            pointer.y = event.clientY

            if (this.pointers.size === 2) {
                // Pinch zoom (always available, it doesn't move the view away from the boat)
                const distance = this.getPinchDistance()
                this.zoomBy((this.pinchDistance - distance) * 0.12)
                this.pinchDistance = distance
                return
            }
            if (!this.drag.active) return

            if (this.mode !== 'overview') {
                // Look around the boat
                // Mouse events come at their own rhythm: move a target, the camera eases to it
                this.chase.orbitYawTarget -= dx * 0.006
                this.chase.orbitPitchTarget = THREE.MathUtils.clamp(this.chase.orbitPitchTarget - dy * 0.004, -0.5, 0.9)
                return
            }
            // World units per pixel at the current zoom
            const unitsPerPixel = (this.distance * 1.1) / window.innerHeight
            this.pan.addScaledVector(this.right, -dx * unitsPerPixel)
            this.pan.addScaledVector(this.forward, dy * unitsPerPixel * 1.4)
            this.pan.clampLength(0, 120)
        })
        const release = (event) => {
            this.pointers.delete(event.pointerId)
            this.pinchDistance = this.getPinchDistance()
            // Lifting one finger of a pinch shouldn't turn into a drag
            if (this.pointers.size !== 1) this.endDrag()
        }
        canvas.addEventListener('pointerup', release)
        canvas.addEventListener('pointercancel', release)
        window.addEventListener('blur', () => {
            this.pointers.clear()
            this.endDrag()
        })

        this.game.events.on('settings:change', (key, value) => {
            if (key === 'mouseCamera') this.setMouseEnabled(value)
            if (key === 'camera' && CAMERA_MODES.includes(value)) this.setMode(value)
        })
        this.game.ticker.on(() => this.update(), TickOrder.VIEW)
    }

    // Next mode in the cycle; saved so it's remembered next visit
    nextMode() {
        const next = CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length]
        this.game.settings.set('camera', next)
    }

    lock() {
        try {
            const request = this.canvas.requestPointerLock()
            request?.catch?.(() => {})
        } catch {
            // Not allowed without a user gesture: the next click on the canvas locks it
        }
    }

    unlock() {
        if (!this.locked) return
        this.releasing = true
        document.exitPointerLock()
    }

    setMode(mode) {
        if (mode === this.mode) return
        if (mode === 'first') this.lock()
        else this.unlock()
        this.mode = mode
        this.chase.initialized = false
        this.chase.orbitYaw = this.chase.orbitYawTarget = 0
        this.chase.orbitPitch = this.chase.orbitPitchTarget = 0
        this.pan.set(0, 0, 0)
        this.applyLens()
        this.game.events.trigger('camera:change', mode)
    }

    applyLens() {
        this.camera.fov = FOV[this.mode]
        // Close near plane in first person, or the bow would get clipped
        this.camera.near = this.mode === 'first' ? 0.1 : 0.5
        this.camera.updateProjectionMatrix()
    }

    getPinchDistance() {
        if (this.pointers.size !== 2) return 0
        const [a, b] = [...this.pointers.values()]
        return Math.hypot(a.x - b.x, a.y - b.y)
    }

    zoomBy(amount) {
        if (this.mode === 'overview') this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + amount, 18, 90)
        else this.chase.targetDistance = THREE.MathUtils.clamp(this.chase.targetDistance + amount * 0.3, 5, 25)
    }

    endDrag() {
        this.drag.active = false
        this.canvas.classList.remove('grabbing')
    }

    setMouseEnabled(enabled) {
        this.mouseEnabled = enabled
        if (!enabled) this.endDrag()
    }

    resize() {
        this.camera.aspect = window.innerWidth / window.innerHeight
        // Pull back a bit on portrait screens so the boat keeps some room around it
        this.portraitFactor = this.camera.aspect < 1 ? 1.5 : 1
        this.applyLens()
    }

    update() {
        const { boat, inputs } = this.game
        const delta = this.game.ticker.delta
        const boatDriving = this.game.playing && inputs.throttle !== 0
        if (this.mode === 'overview') this.updateOverview(delta, boatDriving)
        else this.updateBoatCamera(delta, boatDriving)

        // Whatever the mode, the world stays centered on the boat area
        if (this.mode !== 'overview') this.smoothTarget.set(boat.mesh.position.x, 0, boat.mesh.position.z)
    }

    updateOverview(delta, boatDriving) {
        const { boat } = this.game
        const focus = boat.mesh.position
        const velocity = this.game.state.paused ? { x: 0, z: 0 } : boat.body.linvel()

        // Glide back to the boat as soon as it drives, or when the option is turned off
        if (!this.mouseEnabled || (!this.drag.active && boatDriving)) {
            this.pan.multiplyScalar(Math.exp(-delta * 2.5))
        }

        // Look slightly ahead of the boat
        this.target.set(focus.x + velocity.x * 0.4, 0, focus.z + velocity.z * 0.4).add(this.pan)
        this.smoothTarget.lerp(this.target, 1 - Math.exp(-delta * (this.drag.active ? 12 : 4)))
        this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-delta * 6))

        this.camera.position.copy(this.direction).multiplyScalar(this.distance * (this.portraitFactor ?? 1)).add(this.smoothTarget)
        this.camera.lookAt(this.smoothTarget)
    }

    updateBoatCamera(delta, boatDriving) {
        const { boat } = this.game
        const chase = this.chase
        const position = boat.mesh.position

        // Boat heading only (ignore roll and pitch so the camera doesn't seasick you)
        _euler.setFromQuaternion(boat.mesh.quaternion, 'YXZ')
        if (!chase.initialized) {
            chase.yaw = _euler.y
            chase.look.set(position.x, position.y + 1.2, position.z)
            chase.initialized = true
        }
        chase.yaw = lerpAngle(chase.yaw, _euler.y, 1 - Math.exp(-delta * (this.mode === 'first' ? 10 : 4)))

        // Where you looked stays put while you drive; it only recenters when
        // looking around with the mouse is turned off
        if (!this.drag.active && !this.mouseEnabled) {
            const back = Math.exp(-delta * 2)
            chase.orbitYawTarget *= back
            chase.orbitPitchTarget *= back
        }
        // A locked mouse turns the view instantly, like Minecraft
        const ease = this.locked ? 1 : 1 - Math.exp(-delta * 14)
        chase.orbitYaw += (chase.orbitYawTarget - chase.orbitYaw) * ease
        chase.orbitPitch += (chase.orbitPitchTarget - chase.orbitPitch) * ease
        chase.distance += (chase.targetDistance - chase.distance) * (1 - Math.exp(-delta * 6))

        if (this.mode === 'first') {
            // At the helm: boat heading + half of its roll/pitch, plus where you look
            _yawQuaternion.setFromAxisAngle(_up, chase.yaw)
            _quaternion.copy(_yawQuaternion).slerp(boat.mesh.quaternion, 0.5)
            const eye = boat.eye ?? [0, 1.5, -1]
            this.camera.position.set(...eye).applyQuaternion(_quaternion).add(position)
            _orbitQuaternion.setFromEuler(_euler.set(-chase.orbitPitch, chase.orbitYaw + Math.PI + (boat.eyeYaw ?? 0), 0, 'YXZ'))
            this.camera.quaternion.copy(_quaternion).multiply(_orbitQuaternion)
            return
        }

        // Third person: orbit around the boat, behind (-z) or in front (+z) of it
        const side = this.mode === 'behind' ? -1 : 1
        const angle = chase.yaw + chase.orbitYaw
        const pitch = 0.32 + chase.orbitPitch
        const distance = chase.distance + boat.half.z
        _offset.set(Math.sin(angle) * side, 0, Math.cos(angle) * side).multiplyScalar(Math.cos(pitch) * distance)
        // Relative to the look point, which is already 1.2 m above the boat
        _offset.y = Math.sin(pitch) * distance - 0.2

        // Point looked at: glued to the boat horizontally, but it follows the
        // bobbing on the waves gently, or the whole view would shake with it
        chase.look.x = position.x
        chase.look.z = position.z
        chase.look.y += (position.y + 1.2 - chase.look.y) * (1 - Math.exp(-delta * 3))

        // The camera is placed from the (smoothed) look point and angles: no
        // extra position lag, which would fight the orbit and make it wobble
        this.camera.position.copy(chase.look).add(_offset)
        // Never below the waves
        this.camera.position.y = Math.max(this.camera.position.y, 1.2)
        this.camera.lookAt(chase.look)
    }

    snap(focus) {
        this.smoothTarget.set(focus.x, 0, focus.z)
    }
}
