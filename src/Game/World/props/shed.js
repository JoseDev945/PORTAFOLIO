import * as THREE from 'three/webgpu'
import { colorMaterial, shadow } from '../materials.js'

function createSignTexture(text, background, color) {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 192
    const context = canvas.getContext('2d')
    context.fillStyle = background
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = color
    context.font = '800 120px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 6, canvas.width - 60)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
}

// Industrial workshop: steel frame, low side walls, back wall and a gabled
// roof of translucent fiberglass panels, so the work inside stays visible
// from the camera above. Open front faces local +z.
export default {
    description: 'Nave industrial con techo translúcido',
    schema: {
        width: { type: 'number', default: 8, min: 3, max: 30 },
        depth: { type: 'number', default: 6, min: 3, max: 30 },
        height: { type: 'number', default: 4, min: 2, max: 12 },
        wallColor: { type: 'color', default: '#d9d4c7' },
        sign: { type: 'string', default: '' },
        signColor: { type: 'color', default: '#1f4e8c' }
    },
    create({ params, materials }) {
        const group = new THREE.Group()
        const { width, depth, height } = params
        const wall = colorMaterial(params.wallColor)
        const halfWidth = width / 2
        const halfDepth = depth / 2

        // Floor slab
        const floor = shadow(new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.15, depth + 0.4), materials.concrete))
        floor.position.y = 0.2
        group.add(floor)

        // Back wall and low side walls
        const back = shadow(new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.2), wall))
        back.position.set(0, height / 2, -halfDepth)
        group.add(back)
        const sideHeight = 1.2
        for (const side of [-1, 1]) {
            const sideWall = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.2, sideHeight, depth), wall))
            sideWall.position.set(side * halfWidth, sideHeight / 2, 0)
            group.add(sideWall)
        }

        // Steel columns
        const columnGeometry = new THREE.BoxGeometry(0.22, height, 0.22)
        const columnRows = Math.max(2, Math.round(depth / 3) + 1)
        for (const side of [-1, 1]) {
            for (let i = 0; i < columnRows; i++) {
                const column = shadow(new THREE.Mesh(columnGeometry, materials.steel))
                column.position.set(side * halfWidth, height / 2, -halfDepth + (depth * i) / (columnRows - 1))
                group.add(column)
            }
        }

        // Gabled roof: ridge along z, rafters visible through the panels
        const rise = width * 0.18
        const slope = Math.atan2(rise, halfWidth)
        const panelLength = Math.hypot(halfWidth, rise) + 0.4
        for (const side of [-1, 1]) {
            // A single plane (not a box): stacked transparent layers would turn milky
            const panelGeometry = new THREE.PlaneGeometry(panelLength, depth + 0.6)
            panelGeometry.rotateX(-Math.PI / 2)
            const panel = new THREE.Mesh(panelGeometry, materials.roofPanel)
            panel.position.set(side * halfWidth / 2, height + rise / 2, 0)
            panel.rotation.z = -side * slope
            group.add(panel)
        }
        const rafterGeometry = new THREE.BoxGeometry(panelLength, 0.12, 0.12)
        for (let i = 0; i < columnRows; i++) {
            const z = -halfDepth + (depth * i) / (columnRows - 1)
            for (const side of [-1, 1]) {
                const rafter = shadow(new THREE.Mesh(rafterGeometry, materials.steel))
                rafter.position.set(side * halfWidth / 2, height + rise / 2 - 0.08, z)
                rafter.rotation.z = -side * slope
                group.add(rafter)
            }
        }
        const ridge = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, depth + 0.6), materials.steel))
        ridge.position.set(0, height + rise - 0.05, 0)
        group.add(ridge)

        // Rooftop sign at the front, above the ridge so it doesn't hide the work inside
        if (params.sign) {
            const signWidth = Math.min(width * 0.6, 6)
            const signY = height + rise + 0.55
            const board = shadow(new THREE.Mesh(new THREE.BoxGeometry(signWidth + 0.2, 1, 0.12), materials.steel))
            board.position.set(0, signY, halfDepth - 0.2)
            const postGeometry = new THREE.BoxGeometry(0.1, 0.7, 0.1)
            for (const x of [-signWidth / 3, signWidth / 3]) {
                const post = shadow(new THREE.Mesh(postGeometry, materials.steel))
                post.position.set(x, signY - 0.75, halfDepth - 0.25)
                group.add(post)
            }
            const material = new THREE.MeshBasicMaterial({ map: createSignTexture(params.sign, params.signColor, '#ffffff') })
            material.userData.disposable = true
            const face = new THREE.Mesh(new THREE.PlaneGeometry(signWidth, 0.85), material)
            face.position.set(0, signY, halfDepth - 0.13)
            // Keep the text sharp: not merged with the rest (it has its own texture anyway)
            face.userData.keep = true
            group.add(board, face)
        }

        return {
            object: group,
            colliders: [
                { shape: 'cuboid', size: [halfWidth, height / 2, 0.15], position: [0, height / 2, -halfDepth] },
                { shape: 'cuboid', size: [0.15, sideHeight / 2 + 0.3, halfDepth], position: [-halfWidth, sideHeight / 2, 0] },
                { shape: 'cuboid', size: [0.15, sideHeight / 2 + 0.3, halfDepth], position: [halfWidth, sideHeight / 2, 0] }
            ]
        }
    }
}
