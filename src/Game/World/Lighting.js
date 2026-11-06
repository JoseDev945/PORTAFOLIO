import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'

// Sky light + sun (the moon at night: same light, other color). The shadow
// camera follows the view so shadows stay sharp around the boat. Colors,
// intensities and sunDirection are driven by DayCycle.
export class Lighting {
    constructor() {
        this.game = Game.getInstance()
        const scene = this.game.rendering.scene

        this.sunDirection = new THREE.Vector3(-0.6, 0.8, 0.35).normalize()

        this.hemisphere = new THREE.HemisphereLight('#d6f1ff', '#3a6b4a', 1.4)
        scene.add(this.hemisphere)

        this.sun = new THREE.DirectionalLight('#fff1d6', 2.6)
        // Off in "Rendimiento": shadows render the scene a second time
        const { preset } = this.game.quality
        this.sun.castShadow = preset.shadows
        this.sun.shadow.mapSize.setScalar(preset.shadowMapSize)
        const shadowCamera = this.sun.shadow.camera
        shadowCamera.left = shadowCamera.bottom = -45
        shadowCamera.right = shadowCamera.top = 45
        shadowCamera.near = 1
        shadowCamera.far = 160
        this.sun.shadow.bias = -0.0005
        this.sun.shadow.normalBias = 0.05
        scene.add(this.sun, this.sun.target)
    }

    update(focus) {
        this.sun.target.position.copy(focus)
        this.sun.position.copy(focus).addScaledVector(this.sunDirection, 80)
    }
}
