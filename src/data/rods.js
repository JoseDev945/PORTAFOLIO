// Fishing rods sold at the start island's port (the first one you already have).
//
// name, description   shown in the shop
// price               coins
// style               shape of the rod: 'bamboo' | 'classic' | 'carbon' | 'telescopic' | 'trolling' | 'golden'
// color               main color of the blank
// luck                0 to 1: rare fish become likelier and catches bigger
// speed               multiplies the wait until a fish bites (less = faster)
// window              multiplies the time you have to reel in when it bites (more = easier)
export const rods = [
    {
        id: 'bambu',
        name: 'Caña de bambú',
        description: 'La de siempre. Sencilla y honesta.',
        price: 0,
        style: 'bamboo',
        color: '#c9a35b',
        luck: 0,
        speed: 1,
        window: 1
    },
    {
        id: 'fibra',
        name: 'Caña de fibra',
        description: 'Ligera y flexible: los peces pican antes.',
        price: 120,
        style: 'classic',
        color: '#2f6db5',
        luck: 0.12,
        speed: 0.85,
        window: 1.1
    },
    {
        id: 'telescopica',
        name: 'Caña telescópica',
        description: 'Se estira para llegar más lejos. Más tiempo para recoger.',
        price: 300,
        style: 'telescopic',
        color: '#c8ccd4',
        luck: 0.2,
        speed: 0.8,
        window: 1.35
    },
    {
        id: 'carbono',
        name: 'Caña de carbono',
        description: 'Sensible a cualquier mordida. Atrae peces raros.',
        price: 650,
        style: 'carbon',
        color: '#1d1f26',
        luck: 0.4,
        speed: 0.7,
        window: 1.25
    },
    {
        id: 'currican',
        name: 'Caña de curricán',
        description: 'Corta y robusta, con carrete grande: para los gigantes de mar abierto.',
        price: 1400,
        style: 'trolling',
        color: '#e63946',
        luck: 0.65,
        speed: 0.75,
        window: 1.4
    },
    {
        id: 'dorada',
        name: 'Caña dorada',
        description: 'Una leyenda del puerto. Dicen que el pez luna la sigue.',
        price: 4000,
        style: 'golden',
        color: '#f2c14e',
        luck: 1,
        speed: 0.55,
        window: 1.6
    }
]
