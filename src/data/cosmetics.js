// Clothes sold at the port's clothing stall (Ropa · Lupita). The first skin
// is the one you start with. Everyone in the room sees what you wear.
//
// skins: suit (coveralls), gloves, mask (shipyard respirator), apron (optional)
// hats:  style 'straw' | 'cap' | 'beanie' | 'captain' | 'pirate' | 'crown', color
export const skins = [
    { id: 'galileo', name: 'Overol Galileo', price: 0, suit: '#f2f2f2', gloves: '#2e7d32', mask: true },
    { id: 'marinero', name: 'Marinero', price: 80, suit: '#1f4e8c', gloves: '#f4f1ea', mask: false },
    { id: 'pescador', name: 'Pescador', price: 120, suit: '#f2c14e', gloves: '#3b3b3b', mask: false, apron: '#e9a53b' },
    { id: 'coral', name: 'Coral', price: 200, suit: '#ef5d8e', gloves: '#ffffff', mask: false },
    { id: 'buzo', name: 'Buzo', price: 350, suit: '#1d1f26', gloves: '#f2c14e', mask: false },
    { id: 'tropical', name: 'Tropical', price: 500, suit: '#2a9d8f', gloves: '#f4a261', mask: false, apron: '#e76f51' },
    { id: 'oro', name: 'Leyenda dorada', price: 2500, suit: '#d4a017', gloves: '#fff1c1', mask: false }
]

export const hats = [
    { id: 'paja', name: 'Sombrero de paja', price: 60, style: 'straw', color: '#e9d8a6' },
    { id: 'gorra', name: 'Gorra', price: 90, style: 'cap', color: '#e63946' },
    { id: 'gorro', name: 'Gorro de lana', price: 140, style: 'beanie', color: '#457b9d' },
    { id: 'capitan', name: 'Gorra de capitán', price: 400, style: 'captain', color: '#f4f1ea' },
    { id: 'pirata', name: 'Sombrero pirata', price: 750, style: 'pirate', color: '#1d1f26' },
    { id: 'corona', name: 'Corona', price: 3000, style: 'crown', color: '#f2c14e' }
]
