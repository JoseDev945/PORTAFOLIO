import * as THREE from 'three/webgpu'

// Floating sign above an island
export function createLabel(text, accent) {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 256
    const context = canvas.getContext('2d')
    context.font = '800 110px system-ui, sans-serif'
    const width = Math.min(context.measureText(text).width + 120, 1000)
    const x = (canvas.width - width) / 2
    context.fillStyle = 'rgba(8, 30, 60, 0.8)'
    context.beginPath()
    context.roundRect(x, 40, width, 176, 88)
    context.fill()
    context.fillStyle = accent
    context.fillRect(x + 60, 186, width - 120, 8)
    context.fillStyle = '#ffffff'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, canvas.width / 2, 120)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    // No depth writes: the see-through corners of the sign must not hide the
    // water behind it (the water reads the depth for its color and refraction)
    const material = new THREE.SpriteNodeMaterial({ map: texture, transparent: true, depthWrite: false, fog: false })
    material.userData.disposable = true
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(12, 3, 1)
    return sprite
}
