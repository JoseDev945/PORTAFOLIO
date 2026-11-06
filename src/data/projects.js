// Portfolio content only (texts, links, colors). Where each project sits in
// the world is decided in data/world.js with `project: 'id'`.
//
// title        name on the card and the island sign
// label        shorter sign text (optional, defaults to title)
// year, description, tags, url
// image        screenshot on the card: import it at the top of this file
// color        accent for the sign, zone and card ("#rrggbb")
import galileoWeb from '../assets/images/galileo-web.webp'

export const projects = {
    about: {
        title: 'Hola, soy Jose',
        label: 'INICIO',
        description: 'Desarrollador. Navega hacia las islas para ver mis proyectos.'
    },

    astillero: {
        title: 'Botes Galileo',
        year: '2026',
        description: 'Sitio web de Botes Galileo, mi astillero de botes y pangas de fibra de vidrio en Panamá: modelos, precios, fotos y cotizaciones.',
        tags: ['Sitio web', 'Fibra de vidrio'],
        url: 'https://galileo-gold.vercel.app/',
        image: galileoWeb,
        color: '#2f6db5'
    },

    'proyecto-dos': {
        title: 'Proyecto Dos',
        year: '2025',
        description: 'Descripción corta del proyecto. Qué problema resuelve y qué hiciste tú.',
        tags: ['React', 'Node'],
        url: 'https://github.com/',
        color: '#ffd166'
    },

    'proyecto-tres': {
        title: 'Proyecto Tres',
        year: '2025',
        description: 'Descripción corta del proyecto. Qué problema resuelve y qué hiciste tú.',
        tags: ['Python', 'IA'],
        url: 'https://github.com/',
        color: '#06d6a0'
    },

    'proyecto-cuatro': {
        title: 'Proyecto Cuatro',
        year: '2024',
        description: 'Descripción corta del proyecto. Qué problema resuelve y qué hiciste tú.',
        tags: ['Mobile', 'Flutter'],
        url: 'https://github.com/',
        color: '#4cc9f0'
    },

    'proyecto-cinco': {
        title: 'Proyecto Cinco',
        year: '2024',
        description: 'Descripción corta del proyecto. Qué problema resuelve y qué hiciste tú.',
        tags: ['Diseño', 'Blender'],
        url: 'https://github.com/',
        color: '#c77dff'
    }
}
