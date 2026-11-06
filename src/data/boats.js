// Boat types. The starting boat is playerBoat in data/world.js; players can
// switch at the Botes Galileo showroom ({ type: 'boat-showcase', model: '...' }).
// Any type can also be placed as a moored boat: { type: 'boat', model: 'velero' }.
// Every field is optional: anything missing takes the default and anything
// invalid shows a warning instead of breaking the game.
//
// name, description   shown on the showroom card
// size        width / length / height in meters
// colors      hull, stripe, interior ("#rrggbb")
// layout      'open' (benches), 'console' (center console), 'cabin',
//             'ferry' (walkable deck with seats, helm console and canopy) or
//             'fishing' (walkable deck, console with T-top, rod holders, tub, lights)
// canopy      canopy color (a T-top on console boats), or null
// sail        { color, height } for a sailboat, or null
// motors      outboard motors at the stern, 0 to 3
// cargo       crates on board
// physics     how it handles:
//   mass, power (acceleration), boostPower (with turbo), turn,
//   forwardDrag (top speed: higher = slower), lateralDrag (grip in turns),
//   floatDepth (how deep it sits), verticalDamping (bobbing)
export const boats = {
    lancha: {
        name: 'Lancha',
        description: 'La lancha de siempre: equilibrada y fácil de manejar.',
        size: { width: 2.2, length: 5.2, height: 1.1 },
        colors: { hull: '#f4f1ea', stripe: '#2346a8', interior: '#c9b79c' },
        layout: 'open',
        canopy: '#2346a8',
        motors: 1,
        cargo: true,
        physics: { mass: 6, power: 11, boostPower: 18, turn: 1.7, forwardDrag: 0.9, lateralDrag: 3.2, floatDepth: 0.35, verticalDamping: 1.6 }
    },

    // Botes Galileo models, available at the shipyard showroom
    'galileo-panga': {
        name: 'Galileo Panga 23',
        description: 'La clásica panga de fibra de vidrio: larga, ligera y rápida en línea recta.',
        size: { width: 2, length: 7, height: 1 },
        colors: { hull: '#ffffff', stripe: '#e63946', interior: '#d8cfc0' },
        layout: 'open',
        canopy: null,
        motors: 1,
        cargo: false,
        physics: { mass: 5, power: 13, boostPower: 21, turn: 1.4, forwardDrag: 0.85, lateralDrag: 3, floatDepth: 0.33, verticalDamping: 1.5 }
    },

    'galileo-consola': {
        name: 'Galileo Consola 26',
        description: 'Consola central con T-top y doble motor. La más rápida y ágil de la línea.',
        size: { width: 2.5, length: 6.4, height: 1.2 },
        colors: { hull: '#1d3557', stripe: '#f1faee', interior: '#e9e4d8' },
        layout: 'console',
        canopy: '#f1faee',
        motors: 2,
        cargo: false,
        physics: { mass: 7, power: 16, boostPower: 26, turn: 2, forwardDrag: 0.9, lateralDrag: 3.6, floatDepth: 0.36, verticalDamping: 1.7 }
    },

    'galileo-cabina': {
        name: 'Galileo Cabina 28',
        description: 'Cabina cerrada para travesías largas. Pesada, pero la más estable con olas.',
        size: { width: 2.8, length: 7.4, height: 1.4 },
        colors: { hull: '#f8f4ec', stripe: '#2a9d8f', interior: '#c9b79c' },
        layout: 'cabin',
        canopy: null,
        motors: 2,
        cargo: false,
        physics: { mass: 11, power: 11, boostPower: 17, turn: 1.2, forwardDrag: 0.95, lateralDrag: 4, floatDepth: 0.42, verticalDamping: 2.2 }
    },

    // Center console fishing boat: walk the deck (F), take a rod from a holder
    // (aim at it, G) and fish; the catch goes to the tub. L turns on the lights
    'galileo-corvina': {
        name: 'Galileo Corvina 250',
        description: 'Bote de pesca con consola, porta cañas, tina y luces. F para caminar; apunta a una caña y G para pescar.',
        size: { width: 3.2, length: 11, height: 1.5 },
        colors: { hull: '#f4f6f6', stripe: '#13283a', interior: '#d9d4c4' },
        layout: 'fishing',
        canopy: '#13283a',
        motors: 2,
        cargo: false,
        physics: { mass: 14, power: 12, boostPower: 19, turn: 1.25, forwardDrag: 0.9, lateralDrag: 3.7, floatDepth: 0.45, verticalDamping: 2.1 }
    },

    // Passenger panga: you can get up from the helm (F), walk the deck and sit down
    'galileo-ferry': {
        name: 'Galileo Panga Ferry',
        description: 'Panga de pasajeros con asientos dobles, pasillo central y toldo. Levántate del timón y camina por la cubierta.',
        size: { width: 3.4, length: 14, height: 1.5 },
        colors: { hull: '#d62828', stripe: '#1d1f26', interior: '#9aa3ad' },
        layout: 'ferry',
        canopy: '#ef4444',
        motors: 2,
        cargo: false,
        physics: { mass: 20, power: 10, boostPower: 16, turn: 1, forwardDrag: 0.9, lateralDrag: 3.8, floatDepth: 0.45, verticalDamping: 2.2 }
    },

    // Other boats seen around the world
    velero: {
        name: 'Velero',
        description: 'Un velero tranquilo.',
        size: { width: 2, length: 6, height: 1 },
        colors: { hull: '#ffffff', stripe: '#c0392b', interior: '#b08a5b' },
        layout: 'open',
        canopy: null,
        sail: { color: '#fdf6e3', height: 7 },
        motors: 0,
        cargo: false,
        physics: { mass: 7, power: 8, boostPower: 13, turn: 1.3, forwardDrag: 0.8, lateralDrag: 4, floatDepth: 0.4, verticalDamping: 1.6 }
    },

    pesquero: {
        name: 'Pesquero',
        description: 'Bote de trabajo para pescar.',
        size: { width: 2.6, length: 5.8, height: 1.3 },
        colors: { hull: '#2e86ab', stripe: '#f6c90e', interior: '#8d6e63' },
        layout: 'open',
        canopy: '#c0392b',
        motors: 1,
        cargo: true,
        physics: { mass: 9, power: 9, boostPower: 14, turn: 1.4, forwardDrag: 1, lateralDrag: 3.5, floatDepth: 0.4, verticalDamping: 1.8 }
    }
}
