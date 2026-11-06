import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { props } from './props/index.js'

const round = (value) => Math.round(value * 10) / 10
const _euler = new THREE.Euler()

// Visual editor for data/world.js, only with #debug. Changes apply live on a
// working copy; "Copiar datos" puts the result in the clipboard to paste into
// src/data/world.js (that's what makes them permanent).
export class WorldEditor {
    constructor() {
        this.game = Game.getInstance()
        this.data = structuredClone(this.game.content.world)
        this.history = []
        this.state = { island: this.data.islands?.[0]?.id ?? '', propType: props.has('buoy') ? 'buoy' : [...props.keys()][0] }

        // The file changed on disk: start over from it
        this.game.events.on('content:change', () => {
            if (this.applying) return
            this.data = structuredClone(this.game.content.world)
            this.history = []
            this.refreshIslands()
        })
        this.game.debug.add((pane) => this.setup(pane))
    }

    setup(pane) {
        this.folder = pane.addFolder({ title: '🏝 Terreno (editor)' })

        this.islandList = this.folder.addBinding(this.state, 'island', { label: 'isla', options: this.islandOptions() })
        this.islandList.on('change', () => this.showIsland())

        const place = this.folder.addFolder({ title: 'Agregar' })
        place.addBinding(this.state, 'propType', {
            label: 'objeto',
            options: Object.fromEntries([...props].map(([type, definition]) => [`${type} · ${definition.description ?? ''}`, type]))
        })
        place.addButton({ title: '➕ Objeto donde está el bote' }).on('click', () => this.placeProp())
        place.addButton({ title: '🏝 Isla nueva donde está el bote' }).on('click', () => this.placeIsland())
        place.addButton({ title: '↩ Deshacer' }).on('click', () => this.undo())

        this.copyButton = this.folder.addButton({ title: '📋 Copiar datos (pegar en src/data/world.js)' })
        this.copyButton.on('click', () => this.copy())
        this.showIsland()
    }

    islandOptions() {
        return Object.fromEntries((this.data.islands ?? []).map((island) => [island.id, island.id]))
    }

    refreshIslands() {
        if (!this.islandList) return
        this.islandList.dispose()
        this.islandList = this.folder.addBinding(this.state, 'island', { label: 'isla', options: this.islandOptions(), index: 0 })
        this.islandList.on('change', () => this.showIsland())
        this.showIsland()
    }

    showIsland() {
        this.islandFolder?.dispose()
        this.islandFolder = null
        const island = this.data.islands?.find((entry) => entry.id === this.state.island)
        if (!island) return

        const folder = this.folder.addFolder({ title: `Isla: ${island.id}`, index: 1 })
        this.islandFolder = folder
        const bind = (target, key, options) => {
            folder.addBinding(target, key, options).on('change', () => this.apply())
        }

        island.x ??= 0
        island.z ??= 0
        island.radius ??= 8
        island.seed ??= 1
        island.palms ??= 3
        island.rocks ??= 3
        island.shoreRocks ??= 4
        bind(island, 'x', { min: -150, max: 150, step: 0.1 })
        bind(island, 'z', { min: -150, max: 150, step: 0.1 })
        bind(island, 'radius', { min: 3, max: 40, step: 0.1 })
        bind(island, 'seed', { step: 1 })
        bind(island, 'palms', { min: 0, max: 20, step: 1 })
        bind(island, 'rocks', { min: 0, max: 20, step: 1 })
        bind(island, 'shoreRocks', { label: 'shore rocks', min: 0, max: 20, step: 1 })

        // Dock: on/off, and its angle (an explicit number once edited)
        const auto = Math.hypot(island.x, island.z) < 0.01 ? 90 : THREE.MathUtils.radToDeg(Math.atan2(-island.z, -island.x))
        const dock = {
            get enabled() {
                return island.dock !== false && island.dock !== null
            },
            set enabled(value) {
                island.dock = value ? { angle: null, length: 7 } : false
            },
            get angle() {
                return island.dock?.angle ?? round(auto)
            },
            set angle(value) {
                island.dock = { ...(island.dock || {}), angle: round(value) }
            },
            get length() {
                return island.dock?.length ?? 7
            },
            set length(value) {
                island.dock = { ...(island.dock || {}), length: round(value) }
            }
        }
        folder.addBinding(dock, 'enabled', { label: 'muelle' }).on('change', () => {
            this.apply()
            this.showIsland()
        })
        if (dock.enabled) {
            bind(dock, 'angle', { label: 'muelle °', min: -180, max: 360, step: 1 })
            bind(dock, 'length', { label: 'muelle largo', min: 2, max: 40, step: 0.5 })
        }

        folder.addButton({ title: '🗑 Borrar isla' }).on('click', () => {
            this.snapshot()
            this.data.islands = this.data.islands.filter((entry) => entry !== island)
            this.state.island = this.data.islands[0]?.id ?? ''
            this.apply()
            this.refreshIslands()
        })
    }

    boatPlacement() {
        const { mesh } = this.game.boat
        _euler.setFromQuaternion(mesh.quaternion, 'YXZ')
        return { x: round(mesh.position.x), z: round(mesh.position.z), angle: Math.round(THREE.MathUtils.radToDeg(_euler.y)) }
    }

    placeProp() {
        this.snapshot()
        this.data.props ??= []
        this.data.props.push({ type: this.state.propType, ...this.boatPlacement() })
        this.apply()
    }

    placeIsland() {
        this.snapshot()
        const { x, z } = this.boatPlacement()
        let index = (this.data.islands?.length ?? 0) + 1
        while (this.data.islands?.some((island) => island.id === `isla-${index}`)) index++
        const island = { id: `isla-${index}`, x, z, radius: 6, seed: Math.floor(Math.random() * 1000), palms: 2, dock: false }
        this.data.islands ??= []
        this.data.islands.push(island)
        this.state.island = island.id
        this.apply()
        this.refreshIslands()
    }

    snapshot() {
        this.history.push(structuredClone(this.data))
        if (this.history.length > 50) this.history.shift()
    }

    undo() {
        const previous = this.history.pop()
        if (!previous) return
        this.data = previous
        if (!this.data.islands?.some((island) => island.id === this.state.island)) this.state.island = this.data.islands?.[0]?.id ?? ''
        this.apply()
        this.refreshIslands()
    }

    // Rebuild at most every 150 ms while a slider is being dragged
    apply() {
        clearTimeout(this.timeout)
        this.timeout = setTimeout(() => {
            this.applying = true
            this.game.content.setWorld(structuredClone(this.data))
            this.applying = false
        }, 150)
    }

    async copy() {
        const text = `export const world = ${JSON.stringify(this.data, null, 4)}\n`
        console.log(text)
        try {
            await navigator.clipboard.writeText(text)
            this.copyButton.title = '✓ Copiado, pégalo en src/data/world.js'
            setTimeout(() => (this.copyButton.title = '📋 Copiar datos (pegar en src/data/world.js)'), 2000)
            console.info('[editor] Datos copiados al portapapeles: pégalos en src/data/world.js')
        } catch {
            console.info('[editor] No se pudo usar el portapapeles: copia el texto de arriba en src/data/world.js')
        }
    }
}
