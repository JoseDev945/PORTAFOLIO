import * as THREE from 'three/webgpu'
import { pass, mrt, output, emissive, uniform, screenUV, smoothstep, mix, vec2, vec4, float, saturation, renderOutput } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { fxaa } from 'three/addons/tsl/display/FXAANode.js'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { Game } from './Game.js'
import { TickOrder } from './Ticker.js'

// Renderer (WebGPU with automatic WebGL2 fallback, ?webgl forces WebGL2),
// the scene and the post-processing chain applied to the whole image:
//   bloom      halo around everything emissive (lamps, buoy lights…)
//   tilt-shift top and bottom of the screen blurred: looks like a miniature
//   grading    saturation, contrast and a soft vignette
// Each effect can be toggled with #debug; ?post=off disables all of them.
export class Rendering {
    constructor() {
        this.game = Game.getInstance()
        const { quality } = this.game
        const params = new URLSearchParams(window.location.search)

        this.renderer = new THREE.WebGPURenderer({
            canvas: this.game.canvas,
            antialias: quality.antialias,
            forceWebGL: params.has('webgl')
        })
        // Off in "Modo rendimiento" (see Quality.js)
        this.renderer.shadowMap.enabled = quality.preset.shadows
        this.renderer.shadowMap.type = THREE.PCFShadowMap
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping

        this.scene = new THREE.Scene()

        this.effects = {
            enabled: params.get('post') !== 'off',
            bloom: true,
            tiltShift: quality.preset.tiltShift,
            // Edge smoothing as one cheap pass at the end (MSAA cost 2-4× the FPS on laptops)
            fxaa: quality.fxaa,
            // The miniature look only makes sense seen from above: off in the boat cameras
            overview: true,
            grading: true
        }
        this.uniforms = {
            bloomStrength: uniform(1.1),
            tiltShift: uniform(1),
            // Height of the sharp band in the middle of the screen (0 to 0.5)
            focusBand: uniform(0.16),
            saturation: uniform(1.18),
            contrast: uniform(1.08),
            vignette: uniform(0.35)
        }

        window.addEventListener('resize', () => this.resize())
        this.game.events.on('quality:change', () => this.resize())
        this.game.ticker.on(() => this.render(), TickOrder.RENDER)
        this.game.events.on('camera:change', (mode) => {
            this.effects.overview = mode === 'overview'
            this.setPipeline()
        })
        this.setDebug()
    }

    async init() {
        this.resize()
        await this.renderer.init()
        this.effects.overview = this.game.view.mode === 'overview'
        this.setPipeline()
        // No renderer.compileAsync() here on purpose: tried it (Nov 2026) and
        // the start button unlocked ~4 s later while the first frame still froze
        // ~1 s, because three polls each shader once per frame. Lighthouse TBT
        // looked better, real waiting was worse.
    }

    // (Re)builds the post-processing graph from the enabled effects
    setPipeline() {
        if (!this.effects.enabled) {
            this.pipeline = null
            return
        }
        const { camera } = this.game.view
        const u = this.uniforms
        const scenePass = pass(this.scene, camera)
        // Second render target with only the emissive light: bloom reads that,
        // so white hulls or foam never glow, only real lights do
        scenePass.setMRT(mrt({ output, emissive }))
        const sceneColor = scenePass.getTextureNode('output')
        let color = sceneColor

        if (this.effects.bloom) {
            const glow = bloom(scenePass.getTextureNode('emissive'), 1, 0.45, 0)
            color = color.add(glow.mul(u.bloomStrength))
        }

        if (this.effects.tiltShift && this.effects.overview) {
            // Half resolution: it's a blur anyway, and a quarter of the pixels to process
            const blurred = gaussianBlur(color, null, 3, { resolutionScale: 0.5 })
            const distance = screenUV.y.sub(0.5).abs()
            const amount = smoothstep(u.focusBand, u.focusBand.add(0.3), distance).mul(u.tiltShift)
            color = mix(color, blurred, amount)
        }

        if (this.effects.grading) {
            // In linear light, before tone mapping. Contrast pivots on middle gray (0.18 linear)
            let graded = saturation(color.rgb, u.saturation)
            graded = graded.sub(0.18).mul(u.contrast).add(0.18).max(0)
            const edge = screenUV.sub(0.5).mul(vec2(1.2, 1)).length()
            graded = graded.mul(float(1).sub(smoothstep(0.45, 0.95, edge).mul(u.vignette)))
            color = vec4(graded, 1)
        }

        // FXAA needs the final image (tone mapped, sRGB), so it does that conversion itself
        if (this.effects.fxaa) color = fxaa(renderOutput(color))

        this.pipeline ??= new THREE.RenderPipeline(this.renderer)
        this.pipeline.outputColorTransform = !this.effects.fxaa
        this.pipeline.outputNode = color
        this.pipeline.needsUpdate = true
    }

    setDebug() {
        this.game.debug.add((pane) => {
            const folder = pane.addFolder({ title: '✨ Gráficos' })
            const rebuild = () => this.setPipeline()
            folder.addBinding(this.effects, 'enabled', { label: 'post-procesado' }).on('change', rebuild)
            folder.addBinding(this.effects, 'bloom').on('change', rebuild)
            folder.addBinding(this.uniforms.bloomStrength, 'value', { label: 'bloom fuerza', min: 0, max: 3 })
            folder.addBinding(this.effects, 'tiltShift', { label: 'tilt-shift' }).on('change', rebuild)
            folder.addBinding(this.uniforms.focusBand, 'value', { label: 'zona nítida', min: 0, max: 0.5 })
            folder.addBinding(this.effects, 'grading', { label: 'color' }).on('change', rebuild)
            folder.addBinding(this.effects, 'fxaa', { label: 'FXAA' }).on('change', rebuild)
            folder.addBinding(this.uniforms.saturation, 'value', { label: 'saturación', min: 0, max: 2 })
            folder.addBinding(this.uniforms.contrast, 'value', { label: 'contraste', min: 0.5, max: 1.5 })
            folder.addBinding(this.uniforms.vignette, 'value', { label: 'viñeta', min: 0, max: 1 })
        })
    }

    resize() {
        // A 0×0 window (minimized, hidden iframe…) can't hold render targets: keep the last size
        if (window.innerWidth === 0 || window.innerHeight === 0) return
        this.game.view.resize()
        this.renderer.setPixelRatio(this.game.quality.pixelRatio)
        this.renderer.setSize(window.innerWidth, window.innerHeight)
    }

    render() {
        if (window.innerWidth === 0 || window.innerHeight === 0) return
        if (this.pipeline) this.pipeline.render()
        else this.renderer.render(this.scene, this.game.view.camera)
    }
}
