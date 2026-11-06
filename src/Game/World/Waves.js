import { vec2, float } from 'three/tsl'

// The same wave sum is evaluated on the CPU (buoyancy) and on the GPU (water
// surface), so the boat floats exactly on what is rendered.
const GRAVITY = 9.81

export const waveParams = { amplitude: 1 }

export const waves = [
    { direction: [1, 0.3], amplitude: 0.32, length: 22 },
    { direction: [-0.4, 1], amplitude: 0.2, length: 13 },
    { direction: [0.7, -0.8], amplitude: 0.11, length: 7 },
    { direction: [-1, -0.25], amplitude: 0.05, length: 3.5 }
].map((wave) => {
    const length = Math.hypot(...wave.direction)
    const k = (Math.PI * 2) / wave.length
    return {
        dx: wave.direction[0] / length,
        dz: wave.direction[1] / length,
        amplitude: wave.amplitude,
        k,
        omega: Math.sqrt(GRAVITY * k)
    }
})

export function waveHeight(x, z, time) {
    let height = 0
    for (const wave of waves) {
        height += wave.amplitude * Math.sin((wave.dx * x + wave.dz * z) * wave.k - time * wave.omega)
    }
    return height * waveParams.amplitude
}

// Returns { height, dx, dz } nodes: height and its partial derivatives
export function waveNodes(positionXZ, timeNode, amplitudeNode) {
    let height = float(0)
    let dx = float(0)
    let dz = float(0)

    for (const wave of waves) {
        const phase = positionXZ.dot(vec2(wave.dx, wave.dz)).mul(wave.k).sub(timeNode.mul(wave.omega))
        height = height.add(phase.sin().mul(wave.amplitude))
        const slope = phase.cos().mul(wave.amplitude * wave.k)
        dx = dx.add(slope.mul(wave.dx))
        dz = dz.add(slope.mul(wave.dz))
    }

    return {
        height: height.mul(amplitudeNode),
        dx: dx.mul(amplitudeNode),
        dz: dz.mul(amplitudeNode)
    }
}
