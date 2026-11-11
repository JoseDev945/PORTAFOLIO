import * as THREE from 'three/webgpu'
import RAPIER from '@dimforge/rapier3d-compat'
import { Game } from './Game.js'
import { TickOrder } from './Ticker.js'

// Rapier world with a fixed 60 Hz step. Bodies that need to push themselves
// every substep (buoyancy, motor...) register with onStep().
// With #debug, "Ver colisiones" draws every collider as green lines.
export class Physics {
    // Loads the WASM module, must run before creating the Game
    static async init() {
        await RAPIER.init()
    }

    constructor() {
        this.game = Game.getInstance()
        this.RAPIER = RAPIER
        this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
        this.world.timestep = 1 / 60
        this.accumulator = 0
        // How far the render time is between the last two physics steps (0 to 1),
        // used to draw moving bodies smoothly at any frame rate
        this.alpha = 1
        this.stepCallbacks = []
        // Handles of colliders that are floors for the character (Build, ground: true)
        this.groundColliders = new Set()

        this.game.ticker.on(() => this.update(), TickOrder.PHYSICS)
        this.setWireframe()
    }

    onStep(callback) {
        this.stepCallbacks.push(callback)
    }

    setWireframe() {
        this.wireframe = { visible: false, lines: null }
        this.game.debug.add((pane) => {
            pane.addFolder({ title: '🧱 Física' }).addBinding(this.wireframe, 'visible', { label: 'ver colisiones' })
        })
        this.game.ticker.on(() => this.updateWireframe(), TickOrder.RENDER - 1)
    }

    updateWireframe() {
        const { wireframe } = this
        if (!wireframe.visible) {
            if (wireframe.lines) wireframe.lines.visible = false
            return
        }
        if (!wireframe.lines) {
            const material = new THREE.LineBasicMaterial({ color: '#39ff6a', depthTest: false, transparent: true })
            wireframe.lines = new THREE.LineSegments(new THREE.BufferGeometry(), material)
            wireframe.lines.frustumCulled = false
            wireframe.lines.renderOrder = 10
            this.game.rendering.scene.add(wireframe.lines)
        }
        const { vertices } = this.world.debugRender()
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
        wireframe.lines.geometry.dispose()
        wireframe.lines.geometry = geometry
        wireframe.lines.visible = true
    }

    update() {
        const { gameDelta, elapsed } = this.game.ticker
        if (gameDelta === 0) return
        this.accumulator += gameDelta
        const step = this.world.timestep
        let stepTime = elapsed - this.accumulator
        while (this.accumulator >= step) {
            stepTime += step
            for (const callback of this.stepCallbacks) callback(step, stepTime)
            this.world.step()
            this.accumulator -= step
        }
        this.alpha = this.accumulator / step
    }
}
