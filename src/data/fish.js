// What you can catch while fishing (Corvina 250 and any boat with rod holders).
// Picked at random by `chance`; the habitat makes it likelier in its place:
//   reef  near the islands (corals, shallow water)
//   open  far from the islands (deep water)
//   any   everywhere the same
//
// name           shown when caught
// length, kg     random size range [min, max] in meters and kilos
// color, belly, fin   low poly colors
// tall           body height (0.26 = normal, more = deep body like a dorado)
// bill           true for billfish (marlin)
// junk           'boot' or 'bottle': not a fish, it goes back to the sea
export const fish = [
    { id: 'corvina', name: 'Corvina', chance: 22, habitat: 'any', length: [0.4, 0.8], kg: [1, 6], color: '#b9b49a', belly: '#efeadb', fin: '#9b9479' },
    { id: 'pargo', name: 'Pargo rojo', chance: 18, habitat: 'reef', length: [0.3, 0.7], kg: [0.8, 5], color: '#e0503c', belly: '#f6b3a0' },
    { id: 'robalo', name: 'Róbalo', chance: 14, habitat: 'any', length: [0.4, 0.9], kg: [1.5, 9], color: '#8fa3a8', belly: '#e9eef0', fin: '#5d6b70' },
    { id: 'loro', name: 'Pez loro', chance: 10, habitat: 'reef', length: [0.3, 0.6], kg: [0.6, 3], color: '#36c9b0', belly: '#9be7d9', fin: '#f28fb8' },
    { id: 'dorado', name: 'Dorado', chance: 9, habitat: 'open', length: [0.6, 1.3], kg: [3, 18], color: '#3fbf5a', belly: '#f2d23c', fin: '#2f8fd8', tall: 0.34 },
    { id: 'atun', name: 'Atún aleta amarilla', chance: 7, habitat: 'open', length: [0.7, 1.5], kg: [8, 45], color: '#2a3f6e', belly: '#d8dde6', fin: '#f2c14e', tall: 0.3 },
    { id: 'wahoo', name: 'Wahoo', chance: 4, habitat: 'open', length: [1, 1.7], kg: [10, 35], color: '#3b6fa0', belly: '#cfd8e2' },
    { id: 'marlin', name: 'Marlin azul', chance: 1, habitat: 'open', length: [1.8, 2.8], kg: [60, 180], color: '#1f3c78', belly: '#e3e9f2', fin: '#3d6bd1', bill: true },
    { id: 'bota', name: 'Bota vieja', chance: 5, habitat: 'any', junk: 'boot' },
    { id: 'botella', name: 'Botella con un mensaje', chance: 2, habitat: 'any', junk: 'bottle' }
]
