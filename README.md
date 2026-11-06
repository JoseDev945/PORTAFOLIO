# Portafolio — Bote

Portafolio de proyectos en 3D: navega en bote entre islas y cada isla es un proyecto.
Inspirado en [bruno-simon.com](https://bruno-simon.com/).

## Desarrollo

Requiere Node.js 20+ y pnpm 12+.

```bash
pnpm install
pnpm dev        # http://localhost:1234
pnpm build      # genera dist/
pnpm preview    # sirve dist/
```

Para probar en el celular dentro de la misma red Wi-Fi: `pnpm dev --host`.

## Editar el contenido

Todo el contenido está en `src/data/` y se recarga en vivo al guardar:

- [`world.js`](src/data/world.js): islas, objetos y barco del jugador
- [`projects.js`](src/data/projects.js): textos y enlaces de los proyectos
- [`boats.js`](src/data/boats.js): tipos de barco

Si algo está mal escrito, aparece un aviso en pantalla y el resto sigue funcionando.
Con `#debug` en la URL hay un editor visual del terreno.

## Arquitectura

Ver [ARCHITECTURE.md](ARCHITECTURE.md).
