// Validates content data (world, boats, projects) without ever throwing.
// Every problem is reported through `warn(message)` and replaced by a safe
// value, so a typo in a data file shows a warning instead of a black screen.
//
// Field spec:
//   { type: 'number', default: 1, min: 0, max: 10, integer: true }
//   { type: 'string' | 'boolean' | 'color' | 'any', default }
//   { type: 'enum', values: ['a', 'b'], default: 'a' }
//   { type: 'object', schema: { ...fields } }
//   { type: 'array', of: { ...field spec } }
//   + required: true  → warns when missing
//   + nullable: true  → null / false are accepted as "nothing"

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

const show = (value) => (typeof value === 'string' ? `"${value}"` : JSON.stringify(value))

const clone = (value) => (value && typeof value === 'object' ? structuredClone(value) : value)

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// Closest known key, to suggest a fix for typos like "raduis"
function closest(word, candidates) {
    let best = null
    let bestDistance = 3
    for (const candidate of candidates) {
        const distance = levenshtein(word.toLowerCase(), candidate.toLowerCase())
        if (distance < bestDistance) {
            best = candidate
            bestDistance = distance
        }
    }
    return best
}

function levenshtein(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
        let previous = row[0]
        row[0] = i
        for (let j = 1; j <= b.length; j++) {
            const current = row[j]
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
            previous = current
        }
    }
    return row[b.length]
}

export function sanitize(schema, input, path, warn) {
    if (!isPlainObject(input)) {
        warn(`${path}: debe ser un objeto { ... } (llegó ${show(input)})`)
        input = {}
    }

    const output = {}
    for (const [key, field] of Object.entries(schema)) {
        output[key] = sanitizeValue(field, input[key], `${path}.${key}`, warn)
    }
    for (const key of Object.keys(input)) {
        if (key in schema) continue
        const suggestion = closest(key, Object.keys(schema))
        warn(`${path}.${key}: propiedad desconocida, se ignora${suggestion ? ` (¿quisiste decir "${suggestion}"?)` : ''}`)
    }
    return output
}

export function sanitizeValue(field, value, path, warn) {
    if (value === undefined) {
        if (field.required) warn(`${path}: es obligatorio`)
        return clone(field.default)
    }
    if (field.nullable && (value === null || value === false)) return null

    const fallback = (expected) => {
        warn(`${path}: ${expected} (llegó ${show(value)}), se usa ${show(field.default)}`)
        return clone(field.default)
    }

    switch (field.type) {
        case 'number': {
            if (typeof value !== 'number' || !Number.isFinite(value)) return fallback('debe ser un número')
            let number = field.integer ? Math.round(value) : value
            if (field.min !== undefined && number < field.min) {
                warn(`${path}: el mínimo es ${field.min} (llegó ${value})`)
                number = field.min
            }
            if (field.max !== undefined && number > field.max) {
                warn(`${path}: el máximo es ${field.max} (llegó ${value})`)
                number = field.max
            }
            return number
        }
        case 'string':
            return typeof value === 'string' ? value : fallback('debe ser texto entre comillas')
        case 'boolean':
            return typeof value === 'boolean' ? value : fallback('debe ser true o false')
        case 'color':
            return typeof value === 'string' && HEX_COLOR.test(value) ? value : fallback('debe ser un color como "#ff8800"')
        case 'enum':
            return field.values.includes(value) ? value : fallback(`debe ser uno de ${field.values.map(show).join(', ')}`)
        case 'object':
            return isPlainObject(value) ? sanitize(field.schema, value, path, warn) : fallback('debe ser un objeto { ... }')
        case 'array':
            if (!Array.isArray(value)) return fallback('debe ser una lista [ ... ]')
            return field.of ? value.map((item, index) => sanitizeValue(field.of, item, `${path}[${index}]`, warn)) : value
        default:
            return value
    }
}
