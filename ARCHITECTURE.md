# Arquitectura

Portafolio-juego en 3D: un bote navega entre islas y cada isla es un proyecto.
La estructura sigue el mismo patrón que el portafolio de Bruno Simon
([folio-2025](https://github.com/brunosimon/folio-2025)): un `Game` central,
un loop con orden fijo y sistemas que se comunican por eventos.

## Stack

| Pieza | Tecnología |
|---|---|
| Render | Three.js `WebGPURenderer` (WebGL2 de respaldo) + TSL para shaders |
| Física | Rapier (`@dimforge/rapier3d-compat`) |
| Build | Vite |
| Paquetes | pnpm (con reglas de seguridad en `pnpm-workspace.yaml`) |
| Depuración | Tweakpane, solo con `#debug` |
| Audio | Web Audio API (sintetizado, sin archivos todavía) |

## Carpetas

```
src/
├─ main.js                   Arranque mínimo: pinta la pantalla de inicio y luego import() de Game.js
├─ style.css
├─ data/                     ← CONTENIDO: lo que editas para cambiar el juego
│  ├─ world.js               Mapa: islas, objetos, punto de inicio, barco del jugador
│  ├─ boats.js               Tipos de barco (forma, colores, manejo)
│  └─ projects.js            Textos, enlaces y colores de cada proyecto
└─ Game/                     ← MOTOR
   ├─ Game.js                Instancia central, crea los sistemas en orden (build() por pasos, medidas boot:…)
   ├─ Events.js              Bus de eventos (on / off / trigger)
   ├─ Ticker.js              Loop por frame + TickOrder
   ├─ Content.js             Lee src/data/ y lo recarga en vivo al guardar
   ├─ Diagnostics.js         Avisos de datos inválidos (consola + panel en desarrollo)
   ├─ Settings.js, Quality.js, Debug.js, Inputs.js, Physics.js,
   │  Rendering.js, View.js, Audio.js
   ├─ World/
   │  ├─ World.js            Construye el mundo desde data/world.js
   │  ├─ Build.js            Registra todo lo creado para poder deshacerlo
   │  ├─ Island.js           Terreno de una isla + decoración + muelle + zona
   │  ├─ props/              CATÁLOGO de objetos (un archivo = un objeto)
   │  ├─ WorldEditor.js      Editor visual (#debug)
   │  ├─ materials.js        Paleta compartida
   │  ├─ Label.js, Zone.js, Lighting.js, Sky.js, Water.js, Waves.js, Zones.js
   │  ├─ walkable.js         Superficies caminables a pie (islas, muelles, marina) y amarres
   ├─ Network/
   │  ├─ Network.js          Salas multijugador (PeerJS, se descarga solo al usarlo)
   │  ├─ RemotePlayers.js    Bote, persona y nombre de los demás jugadores (interpolados)
   │  ├─ Emotes.js           Emoji grande sobre el bote / la cabeza
   │  └─ emoteList.js        Lista de emotes (el orden es parte del protocolo)
   ├─ Character/
   │  ├─ Character.js        La persona: a bordo (caminar, sentarse, timón) y en tierra
   │  └─ Avatar.js           Modelo articulado (cadera, rodillas, hombros) y sus poses
   ├─ Boat/
   │  ├─ Boat.js             Física y manejo del barco del jugador
   │  ├─ BoatMesh.js         Modelo 3D a partir de una definición de data/boats.js
   │  └─ Wake.js             Estela
   ├─ UI/                    StartScreen, ProjectCard, PauseMenu, WorldMap, Chat, EmoteWheel, RoomPanel…
   └─ utils/                 schema (validación), merge, random, pointer, players (colores y máximo)
```

## Principios

1. **El contenido son datos, no código.** Islas, objetos, barcos y proyectos se
   describen en `src/data/`. Cambiar el mundo no requiere tocar el motor.
2. **Nada explota por un dato mal puesto.** Cada valor se valida al construir:
   - Un valor inválido se reemplaza por uno seguro y genera un aviso.
   - Una propiedad mal escrita se ignora y el aviso sugiere la correcta
     (`raduis` → "¿quisiste decir radius?").
   - Un objeto que falla al crearse se omite, sin tumbar su isla ni el mundo.
   - Si un rebuild completo falla por un bug del motor, se mantiene el mundo anterior.

   Los avisos salen en la consola y, solo en desarrollo, en un panel naranja en
   pantalla. Los visitantes del sitio publicado nunca lo ven.
3. **Recarga en vivo.** Al guardar un archivo de `src/data/`, el mundo se reconstruye
   sin recargar la página: el bote sigue donde estaba.
4. **Sistemas y piezas.**
   - Un **sistema** usa `Game.getInstance()` y se registra en el loop o en eventos.
   - Una **pieza** recibe sus datos por parámetro (`buildIsland`, los props, `Water`…).
5. **Comunicación por eventos**: los sistemas no se llaman entre sí directamente.
6. **El orden de creación importa** en `Game.js`: cada sistema solo usa en su
   constructor los que se crearon antes.
7. **Tiempo de juego y tiempo real separados.**
   - `ticker.gameDelta` y `ticker.elapsed` se congelan en pausa.
   - `ticker.delta` es el tiempo real.

## Cámaras

`View.js` tiene 4 modos que se cambian con **C** o **F5** (como en Minecraft) o con el botón 🎥 en
celular. El modo elegido se guarda en los ajustes (`settings.camera`).

| Modo | Qué es |
|---|---|
| `overview` | Vista general desde arriba, ángulo fijo. Arrastrar mueve la vista y la rueda hace zoom |
| `behind` | Tercera persona desde atrás |
| `front` | Tercera persona desde adelante, mirando al bote |
| `first` | Primera persona desde el puesto del piloto |

- En las vistas desde el bote, arrastrar gira la cámara alrededor del bote y la rueda o el pellizco
  cambia la distancia. La cámara se queda donde la dejaste aunque manejes; solo vuelve al centro si
  "mover la cámara" está apagado en los ajustes.
- **Primera persona estilo Minecraft**: un clic bloquea el mouse (Pointer Lock) y el mouse gira la vista
  directamente. Esc lo libera y abre la pausa. Caminando, el cuerpo gira con la vista, ↑ ↓ avanzan y
  ← → dan pasos de lado. En celular se arrastra (la vista sigue al dedo, como el mouse) y nunca se
  pide el *pointer lock* (`isTouch()` de `Inputs.js`), porque en Android se tragaría los toques.
- Junto a ⚙ está el botón de pantalla completa (`UI/FullscreenButton.js`).
- La posición de los ojos del piloto depende del tipo de bote: `eyeOffset()` en `BoatMesh.js` la
  calcula según `layout` y tamaño.
- Al cambiar de modo se dispara `camera:change`:
  - El tilt-shift se apaga fuera de la vista general con un uniform (`Rendering.uniforms.overview`, con
    transición suave). **No se reconstruye el post-procesado** al cambiar de cámara: eso recompilaba todos
    sus shaders y bajaban los FPS un momento.
  - `World` acerca la niebla para ocultar el borde del agua en el horizonte.
  - `CameraToast` muestra el nombre del modo.

## Gráficos

| Capa | Dónde | Qué hace |
|---|---|---|
| Post-procesado | `Rendering.js` | **Bloom**: solo brilla lo emisivo, gracias a un canal aparte (MRT). **Tilt-shift**: efecto maqueta. **Color**: saturación, contraste y viñeta |
| Pantalla de inicio | `Rendering.introNode`, `UI/StartScreen.js` | Estilo Bruno Simon: suelo oscuro con marcas × y líneas, y un **disco brillante** alrededor del bote; la escena solo se ve dentro de él (cada píxel se reconstruye a posición de mundo con la profundidad). Al hacer clic el disco se abre a todo el mundo, la cámara se aleja y el efecto se quita del pipeline |
| Día y noche | `World/DayCycle.js` | Fotogramas clave (noche, amanecer, mañana, tarde, atardecer, anochecer) que se interpolan: cielo, niebla, sol/luna, luz ambiente, colores del agua, brillo de luces y estrellas |
| Agua | `World/Water.js` | Estilo "shader de Minecraft". Es **transparente**: se ve el fondo marino y se vuelve azul con la profundidad (absorción por canal, `absorption`). Tiene **refracción** (lo de abajo ondula con las olas), **reflejos reales** del mundo (`reflector`, más fuertes en ángulos rasantes según Fresnel), espuma, líneas de espuma en la playa y destellos del sol para el bloom. Abajo hay un **fondo marino** de arena con cáusticas, de 1 m junto a las islas a 16 m en mar abierto |
| Viento | `World/materials.js` | Las palmeras se mecen con un shader de vértices (`windMaterial`) |
| Fauna | `World/Fauna/` | Bancos de peces (una malla instanciada, colas animadas por shader) que huyen del bote; tortugas que suben a respirar; delfines que te escoltan saltando en mar abierto cuando vas a más de 7 m/s; arrecifes con corales, algas que se mecen y estrellas de mar. Se configura en `fauna` de `data/world.js` (`fishSchools`, `turtles`, `dolphins`, `dolphinHome`, `reef`) |
| Cielo | `World/Sky.js` | Shader estilo shaderpack de Minecraft: sol y luna cuadrados con halo (emisivos, con bloom), atardecer hacia el sol y franja rosa opuesta, cirros, estrellas cuadradas que titilan y giran, aurora al norte de noche |
| Ambiente | `Birds.js`, `Boat/Spray.js` | Gaviotas y salpicaduras en la proa (las nubes de malla se quitaron: el cielo tiene cirros) |
| Criaturas | `Fauna/Creatures.js`, `Fauna/Serpent.js` | Ballena, mantarrayas y tiburón de vez en cuando (`creatureEvery`), medusas que brillan de noche, y la sombra de una serpiente gigante en la vista general |

- **Valores compartidos por los shaders**: `World/shared.js` contiene `time`, `glow` (más alto de noche) y
  `wind`. Cambiarlos afecta a todos los materiales al instante.
- **Para que algo brille**: usa `colorMaterial(color, true)` o `materials.lamp`. Escriben en el canal
  emisivo, así que el bloom les pone halo y de noche brillan más.
- **Para ajustar la atmósfera**: cambia los colores de `KEYFRAMES` en `DayCycle.js`.
- **En #debug**:
  - Paneles **Gráficos** (activar cada efecto y sus intensidades), **Día y noche** (hora, minutos por día,
    pausar) y **Olas y viento**.
- **FPS** (`Quality.js`): nada cambia solo. La resolución es fija (la de la barra) y el único modo es
  **Modo rendimiento** (`Quality.preset`: sin sombras, reflejos ni tilt-shift, agua ligera sin copias de
  pantalla; misma resolución). Se lee al cargar y cambiarlo recarga la página (cambiar sombras o pases en
  vivo dejaba la pantalla celeste). Suavizado: FXAA al final del pipeline en pantallas de densidad 1, nunca
  MSAA (multiplicaba el costo del pase MRT y del agua).
- **Ajustes del jugador** (menú de pausa):
  - **Resolución**: barra de 1 a 100 % de la pantalla real, fija (`Quality.applyResolution`).
  - **Modo rendimiento**: encendido por defecto para todos (al empezar sale un aviso corto) hasta que el
    jugador lo cambia; desde entonces se respeta su elección (`settings.performanceChosen`). Recarga la página.
  - **Reflejos en el agua**: apagarlos evita renderizar el mundo dos veces. En celular los reflejos usan menos resolución.

## Recetas

### Agregar un proyecto
1. Agrega una entrada en `src/data/projects.js` con un id, por ejemplo
   `'mi-app': { title, description, tags, url, color }`.
2. Agrega una isla en `src/data/world.js` con `project: 'mi-app'`.

La isla recibe automáticamente su letrero, su zona, su tarjeta y su lugar en el mapa.

### Modificar el terreno
Edita la isla en `src/data/world.js`:
```js
{
    id: 'isla-uno', x: 58, z: 21, radius: 8, seed: 100, project: 'proyecto-uno',
    ground: 'grass',                            // o 'concrete' / 'sand'
    palms: 3, rocks: 2, shoreRocks: 5,          // decoración aleatoria
    dock: { angle: 180, length: 10 },           // o dock: false
    props: [{ type: 'lighthouse', x: -3, z: 2 }] // objetos a mano (x / z relativos a la isla)
}
```
`seed` cambia la forma y la decoración aleatoria. Con el mismo `seed`, la isla sale
idéntica en cada visita.

### Colocar objetos
Agrega entradas en `props` del mundo (en el mar) o de una isla:
```js
{ type: 'buoy', x: 22, z: 38, color: '#2ecc71' }
{ type: 'boat', model: 'velero', x: -14, z: 20, angle: 30 }
```
Todos los objetos aceptan `x`, `z`, `y`, `angle` (grados), `scale`, `seed` y `physics`, además
de sus propias opciones.

`physics` controla si el objeto tiene física real:
- `auto` (por defecto): lo que diga su tipo; mira la columna **Física** de la tabla.
- `fixed`: queda fijo, por ejemplo una caja de adorno que no quieres que se mueva.
- `dynamic`: se puede empujar.

Los objetos con física en el mar flotan con las olas (la misma fórmula que el bote),
los anclados vuelven a su lugar, y los que están en una isla descansan en el suelo.

| Tipo | Opciones propias | Física |
|---|---|---|
| `palm` | `height`, `leaves` | fija |
| `rock` | `size` | fija |
| `crate` | `size`, `color` | **dinámica**: flota |
| `barrel` | `color` | **dinámica**: flota y rueda |
| `lantern` | `height` | fija |
| `dock` | `length`, `width`, `lantern` | fija |
| `buoy` | `color`, `light` | **dinámica**: flota, anclada |
| `lighthouse` | `height`, `stripes`, `color` | fija |
| `boat` | `model` (de `data/boats.js`) | **dinámica**: flota, anclada |
| `shed` | `width`, `depth`, `height`, `wallColor`, `sign`, `signColor` (nave con techo translúcido) | fija |
| `boat-mold` | `stage`: `mold`, `gelcoat`, `laminate` o `hull`; `moldColor`, `hullColor` | fija |
| `boat-cradle` | `model` (bote terminado sobre soporte) | fija |
| `worker` | `action`: `roll`, `spray`, `sand` o `idle`; `suitColor`, `phase` | fija (animado) |
| `travel-lift` | `length`, `model`, `cycle` (grúa que baja y sube un bote) | fija; el bote en las eslingas se mueve |
| `fiberglass-rolls` | `count` | fija |
| `ball` | `radius`, `color` (pelota de playa) | **dinámica**: ligera y rebota |
| `boat-showcase` | `model`, `accent`, `pier` (exhibición giratoria con zona para cambiar de bote) | fija (animada) |

### Crear un tipo de objeto nuevo
Crea un archivo en `src/Game/World/props/`, por ejemplo `bench.js`. Se registra solo
y ya funciona `{ type: 'bench' }`.
```js
import * as THREE from 'three/webgpu'
import { shadow } from '../materials.js'

export default {
    description: 'Banca',
    schema: {
        length: { type: 'number', default: 2, min: 0.5, max: 6 }
    },
    create({ params, rand, materials }) {
        const group = new THREE.Group()
        const seat = shadow(new THREE.Mesh(new THREE.BoxGeometry(params.length, 0.1, 0.5), materials.wood))
        seat.position.y = 0.45
        group.add(seat)
        return {
            object: group,
            colliders: [{ shape: 'cuboid', size: [params.length / 2, 0.25, 0.25], position: [0, 0.25, 0] }]
        }
    }
}
```
- `colliders` acepta `ball` (`radius`), `cuboid` (`size` en medias medidas) y
  `cylinder` (`radius`, `halfHeight`). Todos aceptan `position`.
  **Todo objeto que el bote pueda tocar debe tener colisión.**
- **Física real**: agrega `body: { type: 'dynamic', mass, floatDepth, anchor: { slack } }`
  a la definición. El objeto queda libre: lo empuja el bote, flota y, con `anchor`,
  vuelve a su lugar. `floatDepth` es cuánto se hunde su centro bajo el agua, y
  `create()` puede devolver `body: { mass }` para calcularlo según sus opciones.
- **Movimiento animado** (sin física, siguiendo una animación): agrega
  `follow: object3D` al colisionador. Se vuelve cinemático, sigue a esa parte del
  objeto y empuja al bote. Así funcionan las boyas de las zonas y el bote del
  travel lift.
- Para revisarlo, abre el sitio con `#debug`, ve a **Física** y activa
  **ver colisiones**: todas las colisiones se dibujan en verde.
- Para que el objeto tenga una zona interactiva (un anillo en el agua), devuelve
  `zones: [{ position: [x, y, z], radius, accent, payload: { type: 'mi-tipo', ... } }]`.
  Al entrar a la zona se dispara `zone:change` con ese `payload`, y Enter dispara
  `interact`. Un componente de UI que escuche esos eventos decide qué hacer, como
  hace `BoatCard` con `type: 'boat'`.
- Para un objeto animado, agrega `animated: true` y una función
  `update(time, object)` en el resultado.
- Usa los materiales de `materials.js` o `colorMaterial(color)`: así se fusionan y
  no restan rendimiento.

### Agregar o modificar barcos
Agrega una entrada en `src/data/boats.js` con:
- `name` y `description`, que salen en la tarjeta de la exhibición.
- Forma (`size`) y colores.
- Distribución (`layout`): `open`, `console`, `cabin` o `ferry` (cubierta caminable con asientos dobles,
  consola de timón y toldo largo; los accesorios se construyen en metros reales, no estirados con el casco).
- Toldo (`canopy`, que en las de consola es un T-top) y vela (`sail`).
- Número de motores (`motors`, de 0 a 3).
- Manejo (`physics`).

Luego:
- Para manejarlo: `playerBoat: 'mi-barco'` en `world.js`.
- Para ponerlo anclado: `{ type: 'boat', model: 'mi-barco', x, z }`.
- Para que el jugador pueda elegirlo:
  `{ type: 'boat-showcase', model: 'mi-barco', x, z, y: 0, angle }`.
  La elección se guarda en los ajustes del navegador (`settings.boat`) y gana sobre
  `playerBoat`.

### Editor visual
1. Abre el sitio con `#debug`.
2. En el panel **Terreno (editor)** puedes:
   - Mover y redimensionar islas, y cambiar su decoración y su muelle.
   - Navegar hasta un lugar y colocar ahí un objeto o una isla nueva.
   - Deshacer.
3. Los cambios se ven al instante pero no se guardan solos. Pulsa **Copiar datos**
   y pega el resultado en `src/data/world.js`.

Ojo: lo copiado reemplaza el archivo completo y no incluye sus comentarios.

### Agregar un sistema nuevo (clima, día/noche, NPCs…)
```js
import { Game } from '../Game.js'
import { TickOrder } from '../Ticker.js'

export class Weather {
    constructor() {
        this.game = Game.getInstance()
        this.game.events.on('world:build', () => { /* el mundo cambió */ })
        this.game.ticker.on(() => this.update(), TickOrder.WORLD + 1)
    }

    update() {
        const { gameDelta, elapsed } = this.game.ticker
    }
}
```
Créalo en `Game.js` o en `World.js`, después de los sistemas que use.

### Agregar una tecla, un ajuste o controles de depuración
- **Tecla o acción nueva**:
  1. Agrégala en `ACTIONS` dentro de `Inputs.js`, con sus 2 teclas por defecto (`null` si solo
     tiene una).
  2. Ponle un nombre en `ACTION_LABELS`; así aparece sola en **Pausa → Controles** y el jugador
     puede cambiarla.
  3. Para celular, agrega un botón en `index.html` con `data-action` o `data-hold`.
  4. Escúchala con `inputs.on('nombre', …)`.

  Las teclas del jugador se guardan en `settings.bindings`, y una tecla solo puede hacer una
  cosa: si se asigna a otra acción, se quita de la anterior. Esc (pausa) no se puede cambiar,
  para que nadie se quede sin poder abrir el menú. Los textos de ayuda en pantalla usan
  `data-hints` y se actualizan solos (`UI/KeyHints.js`).
- **Ajuste**: agrega un valor por defecto en `Settings.js` y un checkbox o un slider (`type="range"`) con
  `data-setting="clave"` en `index.html`. Reacciona escuchando `settings:change`.
- **Depuración**:
  `this.game.debug.add((pane) => pane.addFolder({ title }).addBinding(obj, 'valor'))`.

## Personaje a bordo

En los botes con `layout: 'ferry'` hay una persona (`Character/`), con el mismo traje blanco que los
operarios del astillero. Tiene tres estados:

| Estado | Qué controlan las teclas |
|---|---|
| `driving` | El bote (es el estado inicial, de pie en la consola) |
| `walking` | La persona; el bote queda a la deriva |
| `seated` | Nada; **F** para levantarse |

- **L** (acción `lights`), al timón o junto a la consola, enciende las luces del toldo: los plafones
  brillan y se encienden luces puntuales reales (siempre están en la escena con intensidad 0, para no
  recompilar los materiales al prenderlas).
- El casco abierto tiene una **tapa invisible** a la altura de la borda que solo escribe profundidad
  (`colorWrite: false`, `renderOrder` alto): se dibuja después del bote y antes del agua, así las olas
  nunca se ven atravesando el piso.
- **F** (acción `character`) se levanta del timón, se sienta en el asiento más cercano o toma el timón.
  En pantalla aparece qué hará (`UI/CharacterPrompt.js`).
- Al caminar, en primera persona ← → giran y ↑ ↓ avanzan; en las otras cámaras se camina hacia donde
  apunta la cámara.
- Todo ocurre en el espacio local del bote: la persona es hija del modelo del bote y se mueve con las olas.
- `createBoatMesh` deja el plano de la cubierta en `mesh.userData.deck`: contorno caminable, obstáculos
  (asientos y consola), asientos, timón (con `wheel` y `lever`, que giran con los controles) y el material
  del toldo, que se transparenta cuando la cámara necesita ver la cubierta.

## A pie en tierra (estado `shore`)

Con cualquier bote, al estar quieto (menos de 2,5 m/s) junto a un muelle o una playa, **F** baja a la
persona (`Character.disembark`) y la cámara pasa a seguirla (`Character.rig()`, que `View` usa en vez del
bote). **F** cerca del casco la vuelve a subir al timón; **R** y el viaje del mapa también (evento
`boat:place`). Mientras nadie va a bordo el bote queda **amarrado** (`Boat.setParked`: frena su deriva y
el motor se apaga en el audio).

- **Dónde se puede pisar** (`World/walkable.js`): discos de cada isla (arena a y = 0,6 hasta 0,86 r,
  pasto a y = 1,2 hasta 0,66 r) y cajas que declaran los props en su espacio local:
  `walkable: [{ size: [halfX, halfZ], position: [x, y, z] }]` (el `dock` y la `marina` lo hacen). Las
  piezas se solapan un poco donde se juntan para que no quede un hueco. `world.surfaceAt(x, z, margen)`
  da la superficie más alta.
- **Choques a pie**: una cápsula de Rapier (`intersectionsWithShape`) contra todos los colliders, menos
  los marcados `ground: true` en su spec (suelo de las islas, muelles: `physics.groundColliders`) y el
  propio bote. Palmeras, rocas, faroles, cajas y los botes de los demás bloquean el paso.
- Dónde bajarse (`findLanding`): rayos desde ambos costados, la proa y la popa, hasta 3,2 m; gana el
  punto libre más cercano a donde estás parado.
- **F** hace "lo que hay a mano", en este orden: lo que apunta la mira (caña, timón), el anillo de
  proyecto o de exhibición (antes era Enter; **E** sigue funcionando), bajarse, y lo de la cubierta.

## Marina de inicio (prop `marina`) y amarres

Muelle grande al sur de la isla `inicio`: pasarela, cabezal en T y dedos con un amarre entre cada par
(5, uno por jugador, con su color pintado). El prop declara `berths: [{ position: [x, z], angle }]` (la
línea de popa); `World.berths` los tiene en el mundo y `Boat.updateSpawn` pone el bote del slot del
jugador con la popa allí y la proa hacia el mar. Sin marina se usa `world.spawn`. El anillo del proyecto
de la isla se movió al este con `zone: { angle, distance }` (campo nuevo de las islas).

## Multijugador (`Network/`)

- **Salas de hasta 5** (`utils/players.js`). WebRTC navegador a navegador con **PeerJS** (servidor de
  señalización y TURN gratuitos de peerjs.com; no hay servidor propio). PeerJS se carga con `import()` al
  crear o unirse: no pesa en el arranque.
- **Estrella**: quien crea la sala es el anfitrión (slot 0) y su id de PeerJS es `portafolio-bote-sala-`
  + código de 5 letras. Los demás se conectan a ese id; el anfitrión les da un slot (1–4) y reenvía todo.
  Al reenviar pone `from` (el slot real): nadie puede hablar por otro. Todo lo recibido se valida
  (`validState`, nombres y textos limpios, números acotados) y el chat tiene límite de mensajes.
- Mensajes: ver el comentario al inicio de `Network.js`. Estado 12 veces por segundo con `setInterval`
  (sigue con la pestaña en segundo plano); 12 s sin noticias = se fue.
- **Altura relativa a las olas**: cada jugador tiene su propio reloj de olas, así que se envía
  `y − altura de la ola` y quien recibe lo suma a sus olas.
- `mergeByMaterial` deja aparte las mallas con `renderOrder` o de solo profundidad: la tapa invisible de los
  botes con cubierta debe dibujarse en su orden (fusionada, el bote remoto parpadeaba por dentro).
- `RemotePlayers` dibuja cada estado 170 ms en el pasado, interpolando entre dos (el reloj del otro se
  traduce al nuestro con el menor retraso visto). El bote remoto es `createBoatMesh` + `mergeByMaterial`
  (pocas llamadas de dibujo) con un collider **cinemático** para chocar; su persona va en la cubierta (espacio
  local) o en tierra (mundo), con el color del jugador; el nombre flota encima.
- **Enlace**: `?sala=CODIGO` se une a esa sala al zarpar. **Pausa → 👥 Multijugador** crea/une/copia.
- Si el anfitrión se va, la sala se cierra (no hay migración de anfitrión).

## Puerto pesquero y economía

- **Datos**: `data/fish.js` (cada especie con `price`) y `data/rods.js` (cañas con `style`, `price`, `luck`,
  `speed`, `window`). `Fishing/catalog.js` da la rareza (por `chance`) y el valor de una captura
  (`price × (0,6 + 0,8 × tamaño)`).
- **`Fishing/Inventory.js`** (`game.inventory`, creado antes que `Fishing`): monedas, peces sin vender
  `{ id, kg, length, size }`, cañas compradas y la que se usa. Guarda en `localStorage`
  (`portafolio-inventario`) y dispara `inventory:change`. `Fishing` lee la caña (suerte, rapidez, reflejos)
  y cambia el modelo de la mano; la tina muestra los últimos 14 peces sin vender.
- **Formas de caña**: `createRod({ style, color })` en `Boat/FishingGear.js`.
- **Puestos** (prop `stall`, `kind: 'rods' | 'fish'`): estructura fusionada + vendedor (`createAvatar` con
  `mask: false`, `hat`, `apron`). Declaran `stations: [{ position, radius, payload }]`; a pie dentro del
  radio, **F** dispara `station` y lo abre `RodShop` o `InventoryPanel` en modo venta. Los props pueden
  declarar `footprint` para que la flora aleatoria no salga encima.
- **Paneles** (`UI/Panel.js`): uno a la vez, `inputs.blocked` apaga las teclas del juego, liberan el mouse y
  lo vuelven a bloquear al cerrar en primera persona. Esc, E, I, F o Tab cierran.
- **Íconos** pixelados 16×16 (`UI/icons.js`) dibujados con los colores de los datos.
- **Mira en la tina**: `buildFishingGear` agrega una caja invisible (`tub.aim`); `Fishing.aimedTub` y
  `Character.aimedTarget` (`kind: 'tub'`) hacen que F abra el inventario.

## Ropa y personaje

- `data/cosmetics.js`: `skins` (suit, gloves, mask, apron) y `hats` (`style`: straw, cap, beanie, captain,
  pirate, crown). `catalog.lookOptions(skin, hat)` da las opciones de `createAvatar` (que dibuja cada sombrero).
- `Inventory` guarda `skins/skin/hats/hat`; `buyClothes` y `wear` (ponerse de nuevo lo mismo = quitarlo).
- `Character.applyLook()` reemplaza el avatar en el mismo lugar al cambiar de ropa. En red va `a: [skin, hat]`
  en cada estado y `RemotePlayers.setLook` rehace el avatar del otro.
- Puesto `stall` `kind: 'style'` → `UI/StyleShop.js`. El inventario (E) muestra retrato (`icons.portrait`),
  lo puesto y la fila de ropa.
- **Pescar en PC**: clic derecho con el mouse bloqueado (`Fishing`, `mousedown`). La acción `fish` es fija y
  sin teclas (la usa el botón 🎣). Los avisos pueden llevar `key` para mostrar "Clic" en vez de una tecla.

## Chat y emotes

- **Enter** (acción fija `chat`, como Esc) abre el chat abajo a la derecha (`UI/Chat.js`): Enter envía,
  Esc cancela. Las líneas se desvanecen a los 10 s; abierto se ve todo el historial. Sube solo cuando hay
  una tarjeta de proyecto en esa esquina. Mientras se escribe, `Inputs` ignora las teclas (`isTyping`).
  Las partidas guardadas que tenían Enter en otra acción lo pierden al cargar (`RESERVED_KEYS`).
- **T** (acción `emote`) abre una rueda de 8 emojis (`UI/EmoteWheel.js`): clic o 1–8. El emoji sale
  grande sobre el bote, o sobre la cabeza en tierra (`Network/Emotes.js`): un sprite por jugador que se
  reutiliza redibujando su canvas, así nunca se compila un material nuevo.
- En celular: botones 💬 y 😀.

## Bote de pesca (`layout: 'fishing'`)

La Corvina 250 se dibuja en código, en metros reales, sobre el casco abierto del ferry
(`buildFishingDeck` en `BoatMesh.js`): consola central con T-top, asiento de consola, nevera-asiento,
bancas en proa y popa, porta cañas, tina y luces. Comparte con el ferry `addHelmControls`,
`addOutboards` y `addLid`, y el personaje camina por su cubierta igual (asientos con `y` más alto
levantan la pose). Se probó un `.glb` como guía, pero estaba dañado y se descartó.

## Pesca (`Fishing/Fishing.js`)

Estilo Minecraft, en primera persona, en botes cuyo modelo trae porta cañas y tina
(`mesh.userData.fishing`, lo arma `Boat/FishingGear.js`). Acción `fish` (**G**, clic derecho o 🎣):

1. Con la mira (`UI/Crosshair.js`) apuntas a una caña del porta cañas y la tomas; otra vez G lanza el
   corcho. Apuntando a su porta cañas la guardas.
2. Espera de 5 a 18 s (menos cerca de los arrecifes); burbujas avanzan hacia el corcho.
3. El corcho se hunde con un chapoteo: hay ~1 s para recoger. Si no, el pez se va y se vuelve a esperar.

- Lo que se pesca está en `data/fish.js` (probabilidad, hábitat `reef` / `open` / `any`, tamaño, kilos,
  colores; también basura que se devuelve al mar).
- La captura vuela a la tina; los últimos 14 peces se ven dentro. El conteo y el récord se guardan en
  localStorage (`portafolio-pesca`).
- Acelerar con la caña en la mano la guarda; ir rápido o alejarse con el sedal afuera lo suelta.
- Eventos: `fishing:prompt`, `fishing:toast`, `fishing:tub` (UI en `UI/FishingHud.js` y
  `CharacterPrompt`) y `sfx` (sonidos sintetizados en `Audio.playEffect`).

## Flora luminiscente y noche

- `shared.night` (0 de día, 1 de noche) sigue a las estrellas del ciclo de día y noche.
- Arrecife (`Fauna/Reef.js`): corales, anémonas, abanicos de mar, esponjas, algas y estrellas que de
  noche brillan en colores bioluminiscentes que laten despacio.
- Islas: planta `alien-plant` (hongos, espirales, helechos, bulbos y musgo) con `bioMaterial()`. Se
  reparten solas (`flora` en la isla; `null` = automático, nada en islas de concreto).
- Los letreros (`Label.js`) no escriben profundidad: si lo hacen, el agua detrás se ve como un cuadro.
- `World/Fireflies.js`: luciérnagas sobre el pasto de las islas, animadas solo en el shader; se ocultan
  de día. `fauna.fireflies: false` las quita.
- Ojo con `InstancedMesh` + `positionNode`: ahí `positionLocal` ya incluye la posición de la instancia;
  para deformar según la forma propia usa `positionGeometry`.

## Loop del frame (`TickOrder`)

| Orden | Sistema | Qué hace |
|---|---|---|
| 0 | Quality | Mide los fps reales y ajusta la resolución |
| 10 | Physics | Pasos fijos de Rapier; el bote aplica fuerzas en `onStep` |
| 20 | Boat | Sincroniza el modelo con el cuerpo físico |
| 21 | RemotePlayers | Botes, personas y nombres de los demás jugadores (interpolados) |
| 25 | Character | Persona a bordo o en tierra, timón y acelerador animados, ojos de la primera persona |
| 30 | Wake | Estela |
| 40 | Zones | Calcula la zona activa → `zone:change` |
| 50 | View | Cámara |
| 60 | World | Objetos animados, agua, cielo y sol |
| 70 | Audio | Sonido del motor |
| 80 | UI | Mapa |
| 999 | Rendering | Dibuja la escena |

## Eventos

| Evento | Argumentos | Lo dispara | Lo escuchan |
|---|---|---|---|
| `tick` | — | Ticker | Todos los sistemas, por `ticker.on` |
| `start` | — | Game | Audio, ProjectCard |
| `pause` | `paused` | Game | Audio, Inputs, PauseMenu, WorldMap |
| `content:change` | — | Content (al guardar `src/data/` o usar el editor) | World |
| `world:build` | — | World (después de cada reconstrucción) | Boat |
| `boat:change` | — | Boat (al cambiar de modelo) | Character |
| `character:prompt` | texto o `null` | Character | CharacterPrompt |
| `zone:change` | `active, previous` (payload de la zona) | Zones | ProjectCard, BoatCard, Audio |
| `interact` | `zone` activa | Character (F al timón), Game (E) | ProjectCard (abre el enlace), BoatCard (cambia de bote) |
| `boat:place` | — | Boat (reaparecer, viaje del mapa, unirse a sala) | Character (vuelve a bordo) |
| `character:shore` | `true` / `false` | Character (bajarse / subir) | — |
| `net:status` | `offline` / `connecting` / `hosting` / `joined` | Network | RoomPanel |
| `net:players` | lista de jugadores | Network | RoomPanel |
| `net:error` | texto | Network | RoomPanel |
| `chat:message` | `{ slot, name, text, system }` | Network | Chat |
| `emote` | `{ slot, index, me }` | Network | Emotes |
| `inventory:change` | inventario | Inventory | Fishing, InventoryPanel, RodShop, CoinsHud |
| `station` | `{ shop, label }` | Character (F en un mostrador) | RodShop, InventoryPanel |
| `settings:change` | `key, value` | Settings | View, Audio, Boat, BoatCard |
| `quality:change` | — | Quality | Rendering |
| `ui:click` | — | WorldMap | Audio |
| `camera:change` | `mode` | View | World, CameraToast |
| `action:<nombre>` | — | Inputs | Game |

## Qué pasa con cada tipo de error

| Error | Resultado |
|---|---|
| Valor inválido (`radius: 'grande'`, color mal escrito) | Aviso y valor por defecto |
| Propiedad mal escrita (`raduis`) | Aviso con sugerencia; se ignora |
| Tipo de objeto, barco o proyecto inexistente | Aviso con la lista de los disponibles |
| `id` de isla repetido | Aviso |
| Un objeto con bug al crearse | Error en el panel; solo ese objeto se omite |
| Error de sintaxis en `src/data/` (falta una coma o una llave) | Vite muestra el archivo y la línea; al corregir y guardar, el juego vuelve solo |

## Parámetros de URL

| Parámetro | Efecto |
|---|---|
| `#debug` | Panel de ajustes, editor de terreno, vista de colisiones y contador de fps |
| `?fps` | Solo el contador de fps |
| `?webgl` | Fuerza WebGL2 |
| `?post=off` | Sin post-procesado |
| `?hora=noche` | Empieza a esa hora: `noche`, `amanecer`, `dia` o `atardecer` |
| `?sala=K7M2Q` | Se une a esa sala multijugador al zarpar (es el enlace que copia el anfitrión) |
