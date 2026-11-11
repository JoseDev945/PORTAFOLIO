// 16×16 pixel art icons (Minecraft style) drawn from the data's colors, as
// data URLs for <img>. Shown big with image-rendering: pixelated.
const SIZE = 16
const cache = new Map()

// Paints a grid of colors (null = empty) with a dark outline around it
function paint(grid) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SIZE
    const context = canvas.getContext('2d')
    const filled = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && grid[y][x]
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            let color = grid[y][x]
            if (!color && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) color = 'rgba(20, 18, 24, 0.85)'
            if (!color) continue
            context.fillStyle = color
            context.fillRect(x, y, 1, 1)
        }
    }
    return canvas.toDataURL()
}

const emptyGrid = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(null))

export function fishIcon(species) {
    const key = `fish:${species.id}`
    if (cache.has(key)) return cache.get(key)
    const grid = emptyGrid()
    const body = species.color
    const belly = species.belly ?? '#f1efe6'
    const fin = species.fin ?? species.color
    const cx = 8
    const cy = 8
    const rx = 5.2
    const ry = Math.min(6, 2.4 + (species.tall ?? 0.26) * 6)
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const dx = (x + 0.5 - cx) / rx
            const dy = (y + 0.5 - cy) / ry
            if (dx * dx + dy * dy <= 1) grid[y][x] = y >= cy + 1 ? belly : body
        }
    }
    // Tail on the left, dorsal fin on top
    for (let x = 0; x < 3; x++) {
        const spread = 3 - x
        for (let y = cy - spread - 1; y <= cy + spread; y++) if (y >= 0 && y < SIZE) grid[y][x] = fin
    }
    const top = Math.round(cy - ry)
    for (let x = 6; x <= 9; x++) if (top - 1 >= 0) grid[top - 1 + (x > 8 ? 1 : 0)][x] = fin
    // Eye
    grid[cy - 1][cx + 3] = '#ffffff'
    grid[cy - 1][cx + 4] = '#141218'
    // Billfish: a long spike
    if (species.bill) for (let x = 13; x < SIZE; x++) grid[cy][x] = body
    const url = paint(grid)
    cache.set(key, url)
    return url
}

export function rodIcon(rod) {
    const key = `rod:${rod.id}`
    if (cache.has(key)) return cache.get(key)
    const grid = emptyGrid()
    const set = (x, y, color) => {
        if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) grid[y][x] = color
    }
    const length = rod.style === 'trolling' ? 10 : 13
    // Blank: diagonal from the bottom left (handle) to the top right (tip)
    for (let i = 0; i < length; i++) {
        const x = 1 + i
        const y = 14 - i
        let color = rod.color
        if (i < 3) color = rod.style === 'golden' ? '#3b2416' : rod.style === 'carbon' ? '#1d1f26' : '#b98b55'
        if (rod.style === 'bamboo' && i > 3 && i % 3 === 0) color = '#8a6a35'
        if (rod.style === 'telescopic' && i > 3 && i % 3 === 0) color = '#1d1f26'
        if (rod.style === 'carbon' && i > 3 && i % 4 === 0) color = '#e63946'
        set(x, y, color)
    }
    // Reel under the handle
    const reel = rod.style === 'trolling' || rod.style === 'golden' ? '#f2c14e' : '#c8ccd4'
    set(4, 13, reel)
    set(5, 13, reel)
    set(4, 14, reel)
    if (rod.style === 'trolling') {
        set(5, 14, reel)
        set(3, 13, reel)
    }
    // Line hanging from the tip with a red bobber
    const tipX = length
    for (let y = 15 - length + 1; y < 10; y++) set(tipX + 1, y, '#e8e8e8')
    set(tipX + 1, 10, '#e63946')
    set(tipX + 1, 11, '#f4f1ea')
    if (rod.style === 'golden') {
        set(1, 15, '#7ff6ff')
        set(tipX, 15 - length + 1, '#7ff6ff')
    }
    const url = paint(grid)
    cache.set(key, url)
    return url
}

// Hat shapes in a 16-wide grid, drawn from row `top` down
function drawHat(set, style, color, top) {
    const band = style === 'crown' ? '#e63946' : '#8a2b2b'
    const row = (y, x0, x1, c = color) => {
        for (let x = x0; x <= x1; x++) set(x, y, c)
    }
    if (style === 'straw') {
        row(top, 5, 10)
        row(top + 1, 5, 10, band)
        row(top + 2, 2, 13)
    } else if (style === 'cap') {
        row(top, 5, 10)
        row(top + 1, 4, 11)
        row(top + 2, 4, 14)
    } else if (style === 'captain') {
        row(top, 4, 11)
        row(top + 1, 4, 11)
        set(7, top + 1, '#f2c14e')
        set(8, top + 1, '#f2c14e')
        row(top + 2, 4, 13, '#1d1f26')
    } else if (style === 'beanie') {
        set(7, top - 1, '#f4f1ea')
        set(8, top - 1, '#f4f1ea')
        row(top, 5, 10)
        row(top + 1, 4, 11)
        row(top + 2, 4, 11, '#f4f1ea')
    } else if (style === 'pirate') {
        row(top, 5, 10)
        row(top + 1, 3, 12)
        set(7, top, '#f4f1ea')
        row(top + 2, 1, 14, '#f2c14e')
        row(top + 2, 2, 13)
    } else if (style === 'crown') {
        for (const x of [4, 7, 8, 11]) set(x, top, color)
        row(top + 1, 4, 11)
        row(top + 2, 4, 11)
        set(7, top + 2, band)
    }
}

export function hatIcon(hat) {
    const key = `hat:${hat.id}`
    if (cache.has(key)) return cache.get(key)
    const grid = emptyGrid()
    const set = (x, y, color) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && (grid[y][x] = color)
    drawHat(set, hat.style, hat.color, 6)
    const url = paint(grid)
    cache.set(key, url)
    return url
}

// Coveralls (shirt shape) in the skin's colors
export function skinIcon(skin) {
    const key = `skin:${skin.id}`
    if (cache.has(key)) return cache.get(key)
    const grid = emptyGrid()
    const set = (x, y, color) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && (grid[y][x] = color)
    for (let y = 3; y < 14; y++) for (let x = 4; x < 12; x++) set(x, y, skin.suit)
    for (let y = 3; y < 9; y++) {
        set(2, y, skin.suit)
        set(3, y, skin.suit)
        set(12, y, skin.suit)
        set(13, y, skin.suit)
    }
    for (const x of [2, 3, 12, 13]) set(x, 9, skin.gloves)
    for (let x = 6; x < 10; x++) set(x, 3, '#e0b48a')
    if (skin.apron) for (let y = 7; y < 13; y++) for (let x = 5; x < 11; x++) set(x, y, skin.apron)
    const url = paint(grid)
    cache.set(key, url)
    return url
}

// Front view of your character (16×24) with the skin and the hat
export function portrait(skin, hat) {
    const key = `portrait:${skin.id}:${hat?.id ?? ''}`
    if (cache.has(key)) return cache.get(key)
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 24
    const context = canvas.getContext('2d')
    const set = (x, y, color) => {
        context.fillStyle = color
        context.fillRect(x, y, 1, 1)
    }
    const rect = (x0, y0, x1, y1, color) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, color)
    }
    rect(5, 3, 10, 8, '#e0b48a')
    if (skin.mask) rect(6, 7, 9, 8, '#3a3d44')
    else {
        set(6, 5, '#1d1f26')
        set(9, 5, '#1d1f26')
    }
    if (!hat) rect(5, 2, 10, 3, skin.suit)
    rect(4, 9, 11, 16, skin.suit)
    rect(2, 9, 3, 15, skin.suit)
    rect(12, 9, 13, 15, skin.suit)
    rect(2, 16, 3, 16, skin.gloves)
    rect(12, 16, 13, 16, skin.gloves)
    if (skin.apron) rect(5, 11, 10, 16, skin.apron)
    rect(4, 17, 7, 21, skin.suit)
    rect(8, 17, 11, 21, skin.suit)
    rect(4, 22, 7, 23, '#2b2b2b')
    rect(8, 22, 11, 23, '#2b2b2b')
    if (hat) drawHat(set, hat.style, hat.color, 0)
    const url = canvas.toDataURL()
    cache.set(key, url)
    return url
}
