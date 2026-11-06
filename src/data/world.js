// The whole map. Edit, save, and the world rebuilds live (no reload needed).
// If something is wrong you get a warning on screen and in the console;
// the rest of the world keeps working.
//
// Coordinates: x → east, z → south, in meters. The start island is at 0, 0.
// Angles in degrees: 0 = east (+x), 90 = south (+z), 180 = west, 270 = north.
//
// Tip: open the site with #debug, sail somewhere and use the "Terreno" panel
// to place objects at the boat's position, then "Copiar datos" and paste here.
export const world = {
    // Boat type from data/boats.js
    playerBoat: 'lancha',
    spawn: { x: 5, z: 26, angle: 0 },

    // Sea life: schools of fish and turtles around the islands, a pod of
    // dolphins that swims with you in open water, corals on the seabed
    fauna: {
        fishSchools: 12,
        turtles: 5,
        dolphins: 3,
        dolphinHome: { x: 70, z: 75 },
        // Not every ride: after some time sailing fast in open water there is
        // this chance (0 to 1) that the pod shows up, and then they rest for
        // dolphinRest seconds before they can come again
        dolphinChance: 0.35,
        dolphinRest: 180,
        reef: true,
        // Whales, manta rays, sharks (every ~creatureEvery seconds) and jellyfish
        creatures: true,
        creatureEvery: 75,
        // A giant sea serpent's shadow, sometimes, seen from the overview camera
        serpent: true,
        // Glowing plants on the islands and fireflies at night
        fireflies: true
    },

    // Each island can have:
    //   id          unique name (used in warnings and the editor)
    //   x, z        center
    //   radius      size (3 to 40)
    //   seed        changes the random shape and decoration
    //   project     id from data/projects.js → sign, zone and card (optional)
    //   palms, rocks, shoreRocks   amount of random decoration
    //   dock        { angle, length } or false. angle null = facing the start island
    //   props       extra objects, with x / z relative to the island center
    islands: [
        {
            id: 'inicio',
            x: 0,
            z: 0,
            radius: 9,
            seed: 7,
            project: 'about',
            dock: { angle: 90 },
            palms: 3,
            rocks: 3,
            props: [
                { type: 'crate', x: -3, z: 2.5, angle: 20 },
                { type: 'barrel', x: -2, z: 3.6 }
            ]
        },
        // Fiberglass boat shipyard: the production line from mold to water.
        // Inside the shed (see-through roof): gelcoat sprayed into a mold and
        // fiberglass being laminated. In the yard: a hull out of its mold being
        // sanded and a finished boat. On the north shore a travel lift puts
        // boats in the water.
        {
            id: 'astillero',
            x: 58.3,
            z: 21.2,
            radius: 20,
            seed: 100,
            project: 'astillero',
            ground: 'concrete',
            palms: 0,
            rocks: 0,
            shoreRocks: 0,
            props: [
                { type: 'shed', x: 4, z: 0, angle: -90, width: 9, depth: 7, sign: 'BOTES GALILEO' },

                // 1. Gelcoat sprayed into the mold
                { type: 'boat-mold', stage: 'gelcoat', x: 4, z: -2.2, angle: 90 },
                { type: 'worker', action: 'spray', x: 4.6, z: -0.2, angle: 180 },

                // 2. Fiberglass laminated with resin and roller
                { type: 'boat-mold', stage: 'laminate', x: 4, z: 2.2, angle: 90 },
                { type: 'worker', action: 'roll', x: 3, z: 0.3, angle: 0 },
                { type: 'worker', action: 'roll', x: 5.4, z: 0.4, angle: 0, phase: 1.3 },

                // 3. Hull out of the mold, being sanded
                { type: 'boat-mold', stage: 'hull', x: -2.5, z: -3, angle: 90 },
                { type: 'worker', action: 'sand', x: -2.8, z: -1.1, angle: 180 },

                // 4. Finished boat waiting for the water
                { type: 'boat-cradle', model: 'lancha', x: -2.5, z: 3.4, angle: 90 },

                // Materials
                { type: 'fiberglass-rolls', x: 1.5, z: -6.4, count: 3 },
                { type: 'barrel', x: 3.3, z: -6, color: '#2e86ab' },
                { type: 'barrel', x: 4.1, z: -6.5, color: '#2e86ab' },
                { type: 'crate', x: -5.5, z: 5.5, angle: 15 },
                { type: 'crate', x: -6.3, z: 4.6, size: 0.6 },

                // 5. Travel lift putting a boat in the water (north shore)
                { type: 'travel-lift', x: -4, z: -13, y: 0, angle: 180, model: 'lancha' },

                // 6. Showroom: an arc of platforms off the south shore. Sail into
                // a ring to see the boat's card and switch to it (Enter).
                // Facing outwards: angle = 90 - (position angle around the island)
                { type: 'boat-showcase', model: 'lancha', x: 18.4, z: 18.4, y: 0, angle: 45, accent: '#2346a8', pier: 5 },
                { type: 'boat-showcase', model: 'galileo-panga', x: 6.7, z: 25.1, y: 0, angle: 15, accent: '#e63946', pier: 5 },
                { type: 'boat-showcase', model: 'galileo-consola', x: -6.7, z: 25.1, y: 0, angle: -15, accent: '#457b9d', pier: 5 },
                { type: 'boat-showcase', model: 'galileo-cabina', x: -18.4, z: 18.4, y: 0, angle: -45, accent: '#2a9d8f', pier: 5 },
                // The long passenger ferry gets its own platform off the east shore
                { type: 'boat-showcase', model: 'galileo-ferry', x: 29, z: 0, y: 0, angle: 90, accent: '#d62828', pier: 3 },
                // The fishing boat (Corvina 250) off the north-east shore
                { type: 'boat-showcase', model: 'galileo-corvina', x: 21.5, z: -18, y: 0, angle: 130, accent: '#13283a', pier: 4 },

                { type: 'lantern', x: 0.2, z: -5 },
                { type: 'lantern', x: 0.2, z: 5 },
                { type: 'palm', x: -5.5, z: 7.5 },
                { type: 'palm', x: 6.5, z: 6.5 },
                { type: 'rock', x: 12, z: -18, y: 0, size: 1.3 },
                { type: 'rock', x: 17, z: 8, y: 0, size: 1 },

                // Night lighting: floodlights over the yard (heads facing the
                // center) and lanterns where the showroom piers meet the beach
                { type: 'floodlight', x: -9, z: -7, angle: 52 },
                { type: 'floodlight', x: -9, z: 7, angle: 128 },
                { type: 'floodlight', x: 9, z: -9, angle: -45 },
                { type: 'floodlight', x: 9, z: 9, angle: -135 },
                { type: 'floodlight', x: 4, z: -12, angle: -18 },
                { type: 'floodlight', x: 0, z: 12, angle: 180 },
                { type: 'floodlight', x: -13, z: 0, angle: 90 },
                { type: 'lantern', x: 10.7, z: 13.2, y: 0.6 },
                { type: 'lantern', x: 2.7, z: 16.8, y: 0.6 },
                { type: 'lantern', x: -6.1, z: 15.9, y: 0.6 },
                { type: 'lantern', x: -13.2, z: 10.7, y: 0.6 },
                { type: 'lantern', x: 16.9, z: 1.8, y: 0.6 },
                { type: 'lantern', x: 14.1, z: -9.5, y: 0.6 }
            ]
        },
        { id: 'isla-dos', x: -6.1, z: 69.7, radius: 7, seed: 131, project: 'proyecto-dos', palms: 2 },
        {
            id: 'isla-tres',
            x: -65,
            z: 11.5,
            radius: 9,
            seed: 162,
            project: 'proyecto-tres',
            palms: 2,
            props: [{ type: 'lighthouse', x: -3, z: -3 }]
        },
        { id: 'isla-cuatro', x: -30.4, z: -65.3, radius: 7.5, seed: 193, project: 'proyecto-cuatro', palms: 4 },
        { id: 'isla-cinco', x: 45.3, z: -45.3, radius: 8, seed: 224, project: 'proyecto-cinco', palms: 3 },

        // Small decorative islet without project
        { id: 'islote', x: 30, z: 60, radius: 4, seed: 5, palms: 1, rocks: 1, shoreRocks: 3, dock: false }
    ],

    // Objects in open water (catalog in src/Game/World/props/)
    props: [
        { type: 'buoy', x: 22, z: 38 },
        { type: 'buoy', x: -22, z: 34, color: '#2ecc71' },
        { type: 'buoy', x: 30, z: -18 },
        { type: 'boat', model: 'velero', x: -14, z: 20, angle: 30 },
        { type: 'boat', model: 'pesquero', x: 16, z: 10, angle: -60 },
        { type: 'rock', x: -40, z: 40, size: 1.6 },
        { type: 'rock', x: 12, z: -30, size: 1.2 },

        // Floating things right in front of the start, to bump into
        { type: 'barrel', x: 2, z: 38 },
        { type: 'barrel', x: 4.5, z: 40, color: '#2e86ab' },
        { type: 'barrel', x: 9, z: 37, angle: 40 },
        { type: 'crate', x: 6.5, z: 43, angle: 20 },
        { type: 'crate', x: 0, z: 42, size: 0.6 },
        { type: 'ball', x: 12, z: 45 },
        { type: 'ball', x: -3, z: 46, color: '#457b9d' }
    ]
}
