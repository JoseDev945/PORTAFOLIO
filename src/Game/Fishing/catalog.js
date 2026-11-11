import { fish as SPECIES } from '../../data/fish.js'
import { rods as RODS } from '../../data/rods.js'
import { skins as SKINS, hats as HATS } from '../../data/cosmetics.js'

export { SPECIES, RODS, SKINS, HATS }

export const skinById = (id) => SKINS.find((skin) => skin.id === id) ?? null
export const hatById = (id) => HATS.find((hat) => hat.id === id) ?? null

// createAvatar() options for a skin + hat (unknown ids: the default skin, no hat)
export function lookOptions(skinId, hatId) {
    const skin = skinById(skinId) ?? SKINS[0]
    const hat = hatById(hatId)
    return { suitColor: skin.suit, gloves: skin.gloves, mask: skin.mask, apron: skin.apron ?? null, hat: hat ? { style: hat.style, color: hat.color } : null }
}

export const speciesById = (id) => SPECIES.find((species) => species.id === id) ?? null
export const rodById = (id) => RODS.find((rod) => rod.id === id) ?? null

// Rarity from how often it bites, with Minecraft style colors
const RARITIES = [
    { min: 14, name: 'Común', color: '#e0e0e0' },
    { min: 7, name: 'Poco común', color: '#6cf06c' },
    { min: 3, name: 'Raro', color: '#5aa8ff' },
    { min: 1, name: 'Épico', color: '#d17bff' },
    { min: 0, name: 'Legendario', color: '#ffb347' }
]
export const rarityOf = (species) => RARITIES.find((rarity) => (species?.chance ?? 0) >= rarity.min)

// Coins for one catch: the species price, ×0.6 for the smallest to ×1.4 for the biggest
export const fishValue = (species, size) => (species?.price ? Math.max(1, Math.round(species.price * (0.6 + 0.8 * size))) : 0)

// Where a catch sits in its species' size range (0 to 1), for old saves without it
export const sizeFromLength = (species, length) => {
    if (!species?.length) return 0.5
    const [min, max] = species.length
    return Math.min(1, Math.max(0, (length - min) / Math.max(0.01, max - min)))
}

export const formatCoins = (coins) => `${Math.round(coins).toLocaleString('es')} 🪙`
