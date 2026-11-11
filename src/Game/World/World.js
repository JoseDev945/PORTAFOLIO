import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { TickOrder } from '../Ticker.js'
import { sanitize } from '../utils/schema.js'
import { mergeByMaterial } from '../utils/merge.js'
import { Lighting } from './Lighting.js'
import { Sky } from './Sky.js'
import { Water } from './Water.js'
import { waveParams } from './Waves.js'
import { Build } from './Build.js'
import { buildIsland, ISLAND_SCHEMA } from './Island.js'
import { createProp } from './props/index.js'
import { Zones } from './Zones.js'
import { placePropZones } from './Zone.js'
import { placePropSurfaces, surfaceAt } from './walkable.js'
import { WorldEditor } from './WorldEditor.js'
import { DayCycle } from './DayCycle.js'
import { Birds } from './Birds.js'
import { shared } from './shared.js'
import { Fauna, FAUNA_SCHEMA } from './Fauna/Fauna.js'
import { Fireflies } from './Fireflies.js'

const HORIZON = '#bfe9ff'
const ZENITH = '#3d8fd9'

const WORLD_SCHEMA = {
    playerBoat: { type: 'string', default: 'lancha' },
    spawn: {
        type: 'object',
        default: { x: 5, z: 26, angle: 0 },
        schema: {
            x: { type: 'number', default: 5 },
            z: { type: 'number', default: 26 },
            angle: { type: 'number', default: 0 }
        }
    },
    islands: { type: 'array', default: [] },
    fauna: {
        type: 'object',
        default: Object.fromEntries(Object.entries(FAUNA_SCHEMA).map(([key, field]) => [key, field.default])),
        schema: FAUNA_SCHEMA
    },
    props: { type: 'array', default: [] }
}

const PROJECT_SCHEMA = {
    title: { type: 'string', required: true, default: 'Proyecto' },
    label: { type: 'string', nullable: true, default: null },
    year: { type: 'string', default: '' },
    description: { type: 'string', default: '' },
    tags: { type: 'array', default: [], of: { type: 'string', default: '' } },
    url: { type: 'string', nullable: true, default: null },
    color: { type: 'color', default: '#ffb347' },
    image: { type: 'string', nullable: true, default: null }
}

// Everything around the boat, built from data/world.js. The build is
// rebuilt from scratch whenever the content changes. If a whole rebuild
// fails, the previous world stays on screen.
export class World {
    constructor() {
        this.game = Game.getInstance()
        const scene = this.game.rendering.scene

        scene.fog = new THREE.Fog(HORIZON, 110, 330)
        this.lighting = new Lighting()
        this.sky = new Sky({ scene, horizonColor: HORIZON, zenithColor: ZENITH })
        this.water = new Water({
            scene,
            islands: [],
            sunDirection: this.lighting.sunDirection,
            skyColor: HORIZON,
            reflections: this.reflectionOptions(),
            lite: this.game.quality.preset.liteWater
        })
        // Reflections render the world a second time: "Reflejos en el agua" can turn them off
        const reflectionSize = () => this.water.setPixelRatio(this.game.quality.pixelRatio)
        reflectionSize()
        this.game.events.on('quality:change', reflectionSize)
        this.game.events.on('settings:change', (key) => {
            if (key !== 'reflections') return
            this.water.setReflections(this.reflectionOptions())
            reflectionSize()
        })
        this.birds = new Birds({ scene })
        this.dayCycle = new DayCycle({ lighting: this.lighting, sky: this.sky, water: this.water, stars: this.sky, fog: scene.fog })
        this.zones = new Zones()
        this.faunaConfig = WORLD_SCHEMA.fauna.default
        this.fauna = new Fauna(this)
        this.fireflies = new Fireflies(this)
        // Looking at the horizon from the boat, the fog must hide the edge of
        // the water grid (210 m away) before it shows
        const setFog = (mode) => {
            scene.fog.near = mode === 'overview' ? 110 : 45
            scene.fog.far = mode === 'overview' ? 330 : 200
        }
        setFog(this.game.view.mode)
        this.game.events.on('camera:change', setFog)
        // Water and mooring forces on physical props, every physics substep
        this.game.physics.onStep((dt, time) => this.build?.step(dt, time))

        this.build = null
        this.islands = []
        this.walkables = []
        this.berths = []
        this.stations = []
        this.spawn = WORLD_SCHEMA.spawn.default
        this.playerBoat = WORLD_SCHEMA.playerBoat.default
        this.rebuild()

        this.game.events.on('content:change', () => this.rebuild())
        this.game.debug.add((pane) => {
            const folder = pane.addFolder({ title: '🌊 Olas y viento' })
            folder.addBinding(waveParams, 'amplitude', { label: 'olas', min: 0, max: 3, step: 0.01 })
            folder.addBinding(shared.wind, 'value', { label: 'viento', min: 0, max: 3 })
        })
        if (this.game.debug.active) this.editor = new WorldEditor()
        this.game.ticker.on(() => this.update(), TickOrder.WORLD)
    }

    reflectionOptions() {
        const { preset } = this.game.quality
        return { enabled: preset.reflections && this.game.settings.get('reflections'), resolution: preset.reflectionResolution }
    }

    rebuild() {
        const { content, diagnostics, rendering, physics } = this.game
        diagnostics.clear()
        const warn = (message) => diagnostics.warn(message)
        const error = (message, exception) => diagnostics.error(message, exception)
        const build = new Build({ scene: rendering.scene, physics })

        let islands
        let data
        try {
            data = sanitize(WORLD_SCHEMA, content.world, 'world', warn)
            const projects = this.resolveProjects(content.projects, warn)
            islands = this.buildIslands(data.islands, projects, { build, content, warn, error })
            this.buildProps(data.props, { build, content, warn, error })
        } catch (exception) {
            // Unexpected bug in the builder itself: keep what's already on screen
            error('No se pudo reconstruir el mundo, se mantiene la versión anterior', exception)
            build.dispose()
            return
        }

        this.build?.dispose()
        this.build = build
        this.islands = islands
        this.walkables = build.walkables
        // Player berths at the marina (slot order), in world space
        this.berths = build.berths
        this.stations = build.stations
        this.spawn = data.spawn
        this.playerBoat = data.playerBoat
        this.faunaConfig = data.fauna
        this.zones.setEntries(build.zones)
        this.water.setIslands(islands)
        this.game.events.trigger('world:build')
    }

    resolveProjects(raw, warn) {
        if (raw === null || typeof raw !== 'object') {
            warn('projects: debe ser un objeto { id: { ... } }')
            return {}
        }
        return Object.fromEntries(Object.entries(raw).map(([id, project]) => [id, { id, ...sanitize(PROJECT_SCHEMA, project, `projects.${id}`, warn) }]))
    }

    buildIslands(list, projects, context) {
        const { warn, error } = context
        const islands = []
        const ids = new Set()
        list.forEach((raw, index) => {
            const path = `world.islands[${index}]${raw?.id ? ` (${raw.id})` : ''}`
            try {
                const island = sanitize(ISLAND_SCHEMA, raw, path, warn)
                if (ids.has(island.id)) warn(`${path}.id: "${island.id}" está repetido, usa nombres únicos`)
                ids.add(island.id)

                let project = null
                if (island.project) {
                    project = projects[island.project] ?? null
                    if (!project) warn(`${path}.project: no existe "${island.project}" en data/projects.js. Disponibles: ${Object.keys(projects).join(', ')}`)
                }
                islands.push(buildIsland(island, project, path, context))
            } catch (exception) {
                error(`${path}: no se pudo crear la isla`, exception)
            }
        })
        return islands
    }

    // Objects in open water. Static ones are merged together, animated ones stay apart.
    buildProps(list, { build, content, warn, error }) {
        const group = new THREE.Group()
        const colliders = []
        const updaters = []
        const placed = []
        list.forEach((entry, index) => {
            const path = `world.props[${index}]`
            try {
                const prop = createProp(entry, path, { warn, content, groundY: 0 })
                if (!prop) return
                group.add(prop.object)
                placed.push(prop)
                // Physical props get their own dynamic body later, the rest are fixed
                if (!prop.body) for (const collider of prop.colliders) colliders.push([collider, prop.object])
                if (prop.update) updaters.push((time) => prop.update(time, prop.object))
            } catch (exception) {
                error(`${path}: no se pudo crear "${entry?.type}"`, exception)
            }
        })
        mergeByMaterial(group)
        build.add(group)
        for (const [spec, parent] of colliders) build.addCollider(spec, parent)
        for (const prop of placed) placePropZones(build, prop)
        for (const prop of placed) placePropSurfaces(build, prop)
        for (const prop of placed) if (prop.body) build.addDynamic(prop)
        build.onUpdate((time) => updaters.forEach((update) => update(time)))
    }

    // Floor under (x, z) for someone on foot, `margin` inside its edges: { y } or null (water)
    surfaceAt(x, z, margin = 0) {
        return surfaceAt(this.walkables, x, z, margin)
    }

    update() {
        const { view, ticker } = this.game
        shared.time.value = ticker.elapsed
        this.dayCycle.update(ticker.gameDelta)
        this.birds.update(ticker.gameDelta, ticker.elapsed, view.smoothTarget)
        this.build?.update(ticker.elapsed)
        this.water.update(ticker.elapsed, view.smoothTarget)
        this.sky.update(view.camera)
        this.lighting.update(view.smoothTarget)
    }
}
