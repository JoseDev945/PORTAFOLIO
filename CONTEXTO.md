# Contexto del proyecto (para continuar en un chat nuevo)

> Pega o adjunta este archivo al empezar un chat nuevo. Resume todo lo hablado y construido
> hasta el 10 de noviembre de 2026. Los detalles técnicos de cada sistema están en
> [ARCHITECTURE.md](ARCHITECTURE.md); este archivo explica **qué se hizo, por qué, cómo se
> trabajó y qué falta**.

---

## 1. Quién soy y cómo trabajamos

- Hablo español. Las respuestas, los textos del juego y la documentación van en español.
  **El código y sus comentarios van en inglés.**
- Trabajo en Windows 11, en `C:\Users\termi\Desktop\Portafolio`.
- Uso **pnpm** (no npm), por seguridad.
- **Repositorio**: https://github.com/JoseDev945/PORTAFOLIO (rama `main`, primer push el 6 de
  noviembre de 2026). No hagas commit ni push salvo que lo pida.
- Pruebo en el navegador. Cuando algo falla, lo digo con mis palabras ("parpadea", "tiembla",
  "va lento").
- **No verifiques en el navegador** (gasta muchos tokens): revisa con `node --check` y `pnpm build`;
  yo pruebo al final.

## 2. El proyecto

Un **portafolio de proyectos en 3D estilo [bruno-simon.com](https://bruno-simon.com/)**, pero
en vez de un carro en una isla, **manejas un bote en el mar entre islas**. Cada isla es un
proyecto.

- Se usan **las mismas tecnologías que Bruno Simon**: revisé su repositorio público
  [folio-2025](https://github.com/brunosimon/folio-2025).
- Estilo visual de referencia: low poly tropical y colorido, con faroles brillantes, aguas
  turquesa, anillos punteados de zona y boyas, y look de diorama isométrico.

### Stack

| Pieza | Tecnología |
|---|---|
| Render | Three.js **0.186.1** con `WebGPURenderer` (WebGL2 de respaldo) y **TSL** para shaders |
| Física | Rapier (`@dimforge/rapier3d-compat` 0.21) |
| Build | Vite 8 (puerto 1234) |
| Paquetes | pnpm 12.15 con reglas de seguridad |
| Depuración | Tweakpane, se carga solo con `#debug` |
| Audio | Web Audio API (todo sintetizado, sin archivos) |
| Multijugador | PeerJS 1.5.5 (WebRTC; se descarga solo al crear o unirse a una sala) |

Comandos:

```bash
pnpm install
pnpm dev        # http://localhost:1234
pnpm build
pnpm dev --host # para probar en el celular dentro de la misma red
```

### Seguridad de pnpm (`pnpm-workspace.yaml`)

- `minimumReleaseAge: 4320`: no instala versiones con menos de 3 días de publicadas. Por eso
  three quedó en 0.186.1: la 0.187.0 había salido ese mismo día.
- `trustPolicy: no-downgrade`, `strictDepBuilds: true`, `allowBuilds: {}` y
  `blockExoticSubdeps: true`.
- Si una versión nueva sale rechazada, se elige una más madura. **No se relajan las reglas.**

---

## 3. Arquitectura (resumen; el detalle está en ARCHITECTURE.md)

Sigue el patrón de Bruno Simon:

- `Game.getInstance()` es el singleton desde el que cada sistema obtiene lo que necesita.
- `Ticker` es el loop por frame con orden fijo (`TickOrder`: Quality 0, Physics 10, Boat 20,
  Wake 30, Zones 40, View 50, World 60, Audio 70, UI 80, Render 999).
- `Events` es un bus pub/sub; los sistemas no se llaman entre sí directamente.

```
src/
├─ data/            CONTENIDO editable (se recarga en vivo al guardar)
│  ├─ world.js      islas, objetos, spawn, barco inicial, fauna
│  ├─ boats.js      tipos de barco (forma, colores, layout, motores, física)
│  └─ projects.js   textos/enlaces/colores de proyectos
└─ Game/            MOTOR
   ├─ Game, Events, Ticker, Content, Diagnostics, Settings, Quality, Debug,
   │  Inputs, Physics, Rendering, View, Audio
   ├─ World/        World, Build, Island, Zone(s), Water, Waves, Sky, Stars, Clouds, Birds,
   │                DayCycle, Lighting, materials, shared, floating, WorldEditor, Label
   │  ├─ props/     catálogo de objetos (un archivo = un tipo, se registra solo)
   │  └─ Fauna/     Fauna, Fish, Turtles, Dolphins, Reef
   ├─ Boat/         Boat, BoatMesh, Wake, Spray
   ├─ Character/    Character (a bordo y en tierra), Avatar
   ├─ Network/      Network (salas PeerJS), RemotePlayers, Emotes, emoteList
   ├─ UI/           StartScreen, ProjectCard, BoatCard, PauseMenu, ControlsPanel,
   │                KeyHints, WorldMap, CameraToast, Chat, EmoteWheel, RoomPanel
   └─ utils/        schema (validación), merge, random, pointer, keys, players
```

Principios clave:

- **El contenido son datos, no código.** `data/*.js` se valida con `utils/schema.js`. Un dato
  malo muestra un aviso (en la consola y, en desarrollo, en un panel naranja) y usa un valor
  seguro; **el juego nunca se rompe** por eso. Incluso sugiere correcciones de typos
  ("¿quisiste decir radius?").
- **Recarga en vivo**: al guardar `data/*.js`, `Content` dispara `content:change` y el mundo se
  reconstruye sin recargar la página. `Build` registra todo lo creado (objetos, cuerpos físicos,
  zonas) para poder deshacerlo.
- **Catálogo de props**: cada archivo en `World/props/` se registra solo con
  `import.meta.glob`. Un prop declara `schema`, `create()`, `colliders`, opcionalmente `zones`,
  `body` (física dinámica), `animated` (tiene `update()`), `walkable` (pisos a pie) y `berths` (amarres).
- **Sistemas y piezas**: un *sistema* usa `Game.getInstance()` y se registra en el ticker o en
  eventos; una *pieza* recibe sus datos por parámetro.
- **Tiempo de juego y tiempo real separados**: `ticker.gameDelta` y `ticker.elapsed` se
  congelan en pausa; `ticker.delta` es el tiempo real.

### Eventos principales

`tick`, `start`, `pause`, `content:change`, `world:build`, `zone:change` (payload
`{type:'project'|'boat', …}`), `interact` (F al timón o E), `settings:change`, `quality:change`,
`camera:change`, `ui:click`, `action:<nombre>`, `boat:place`, `net:status`, `net:players`,
`chat:message` y `emote`.

---

## 4. Todo lo que se construyó (en orden)

1. **Base**: Vite + Three WebGPU + Rapier.
   - Agua con olas cuya fórmula (`Waves.js`) es **la misma en CPU y GPU**, así el bote flota
     exactamente sobre lo que se ve.
   - Bote con flotación por puntos del casco.
   - Cámara isométrica fija que sigue al bote.
   - Islas con muelle, farol, letrero y zona de proyecto.
2. **Rendimiento**:
   - Geometría estática fusionada por material (`mergeByMaterial`), lo que bajó los objetos de
     376 a 87.
   - Sin luces puntuales: los faroles usan un sprite de brillo en su lugar.
   - Materiales Lambert en lugar de Standard.
   - Calidad (`Quality.js`): resolución fija y Modo rendimiento.
   - *Ojo*: el panel de vista previa de la app es lento con cualquier canvas WebGPU. Ahí no se
     puede medir el rendimiento real.
3. **Mapa (Tab)**: canvas 2D con las islas y la posición del bote, orientado como la cámara.
4. **Pausa (Esc)** con ajustes:
   - música y efectos;
   - mover la cámara arrastrando;
   - sensibilidad de giro;
   - resolución;
   - reflejos en el agua;
   - mostrar FPS;
   - página de **Controles** para reasignar teclas.
5. **Audio sintetizado**: motor, oleaje (ruido marrón con loop sin clic), música generativa y
   clics. Se corrigió que "sonaba a estática" (era ruido blanco) y que los interruptores "no
   funcionaban" (en pausa los efectos ya estaban callados).
6. **Celular**:
   - joystick, botón TURBO y botones de reaparecer 🗺 y cámara 🎥;
   - arrastrar para mirar y pellizcar para hacer zoom;
   - tarjetas arriba para no tapar los controles;
   - `capturePointer` protegido.
7. **Migración npm → pnpm** y limpieza: se quitó gsap (no se usaba) y tweakpane se carga bajo
   demanda.
8. **Arquitectura escalable** (patrón Bruno) y luego un **sistema de contenido por datos**:
   validación, recarga en vivo, catálogo de props y **editor visual en `#debug`** (mover y
   redimensionar islas, colocar objetos o islas donde está el bote, deshacer, "Copiar datos").
9. **Isla del astillero "Botes Galileo"** (proyecto `astillero`, isla `astillero`):
   - nave con techo translúcido y letrero **BOTES GALILEO**;
   - línea de producción de fibra de vidrio: molde, gelcoat, laminado y casco desmoldado;
   - operarios animados (rociar, rodillo, lijar);
   - bote terminado en soporte;
   - **travel lift** que sube y baja un bote;
   - rollos de fibra y tambos de resina.
10. **Exhibición de botes en el astillero**: 4 plataformas giratorias con zonas. Al entrar,
    aparece una tarjeta con estadísticas y **Enter cambia de bote**; la elección se guarda.
    Modelos nuevos:
    - `galileo-panga` (Panga 23);
    - `galileo-consola` (Consola 26, con T-top y doble motor);
    - `galileo-cabina` (Cabina 28).

    También quedaron la `lancha` original, el `velero` y el `pesquero`.
11. **Colisiones**: todo lo alcanzable tiene colisión, y las cosas animadas usan colliders
    cinemáticos (`follow`). En `#debug` hay un interruptor **"ver colisiones"**.
12. **Física real en objetos**: barriles, cajas, boyas, barcos anclados y pelotas de playa
    flotan con las olas y se empujan. Los anclados regresan a su lugar. *Lección*: la
    flotación se aplica a la altura del centro de masa; si se aplica abajo, los objetos se
    voltean.
13. **Gráficos**:
    - post-procesado: **bloom solo de lo emisivo** (canal MRT aparte), **tilt-shift** solo en
      la vista general, y corrección de color con viñeta;
    - **ciclo día/noche** con fotogramas clave (amanecer, atardecer, noche con estrellas,
      faroles más brillantes de noche);
    - nubes que se transparentan sobre el bote, gaviotas, palmeras con viento (shader de
      vértices) y salpicaduras en la proa.
14. **Cámaras estilo F5 de Minecraft** (**C** o **F5**; 🎥 en celular): vista general,
    tercera persona desde atrás, tercera persona desde adelante y **primera persona**. El ojo
    del piloto depende del tipo de bote; en la Cabina va sobre el techo, en el flybridge.
15. **Teclas reasignables** (Pausa → Controles): 2 teclas por acción. Las teclas en conflicto
    se mueven de una acción a otra y Esc queda fijo. Los textos de ayuda (`data-hints`) se
    actualizan solos.
16. **Agua estilo shader de Minecraft**:
    - transparente, con absorción por profundidad;
    - **refracción**;
    - **reflejos reales** (`reflector`, con Fresnel);
    - **fondo marino** de arena con cáusticas, de 1 m a 16 m de profundidad.

    Ajustes de **Resolución** (Auto / 50–150 %) y **Reflejos**.
17. **Fauna marina** (`World/Fauna/`, configurable en `world.js > fauna`):
    - bancos de peces instanciados que **huyen del bote**;
    - tortugas que suben a respirar;
    - **delfines que te escoltan saltando** en mar abierto a más de 7 m/s, solo de vez en cuando
      (`dolphinChance` y `dolphinRest` en `world.js`);
    - arrecifes con corales, algas y estrellas de mar.
18. **Cámara temblaba** al girar con el mouse mientras manejabas. Se corrigió con
    **interpolación de física** (el bote y los objetos dinámicos se dibujan entre los dos
    últimos pasos de 60 Hz) y suavizando el giro del mouse y el punto de mira. En la prueba,
    el temblor bajó de 8.69 a 3.64, y a ~0 sin mouse.
19. **Indicador de FPS** en Ajustes: muestra "FPS · ms · %" con colores verde, amarillo y rojo.
20. **Panga Ferry y personaje a bordo** (`galileo-ferry`, plataforma propia al este del astillero):
    - layout `ferry`: casco abierto con bordas, asientos dobles con espaldar y pasillo central, toldo
      largo y consola de estribor con **timón en la cara de popa** y **acelerador a la derecha** del piloto
      (en la imagen de referencia estaban mal colocados);
    - persona con el traje blanco de los operarios: **F** se levanta del timón, camina por la cubierta, se
      sienta o vuelve a manejar. Mientras camina el bote queda a la deriva.
    - ampliado a 14 × 3,4 m con 2,5 m bajo el toldo; **L** enciende las luces desde la consola;
      tapa invisible para que el agua no se vea dentro del bote;
    - cámara que no se regresa al manejar y primera persona estilo Minecraft (mouse bloqueado).
21. **Corvina 250 y pesca estilo Minecraft** (6 de noviembre de 2026):
    - bote de pesca dibujado en código (`layout: 'fishing'`, 11 × 3,2 m), plataforma al noreste del
      astillero. El .glb que pasó el usuario era solo guía (estaba dañado) y se quitó;
    - cubierta caminable (F), asientos, porta cañas, tina, luces (L) y luces de navegación;
    - mira en el centro en primera persona: apuntas a una caña y G la toma;
    - en primera persona, **G** / clic derecho / 🎣 lanza y recoge: burbujas que se acercan, el corcho
      se hunde y hay ~1 s para recoger. Los peces (`data/fish.js`) vuelan a la tina y se guardan;
    - arrecife **luminiscente de noche** (anémonas, abanicos, esponjas nuevas), plantas tipo Avatar en
      las islas que brillan de noche y **luciérnagas**;
    - la tarjeta de Botes Galileo muestra una **captura del sitio** y enlaza a
      https://galileo-gold.vercel.app/.
22. **Pulido del 6 de noviembre de 2026**:
    - **clic derecho** en primera persona prende/apaga las luces del bote (si tienes caña o apuntas a
      una, sigue siendo pescar);
    - las **zonas** se activan cuando cualquier parte del casco toca el anillo, no solo el centro;
    - **isla del astillero** más grande (radio 20), plataformas y muelles movidos hacia afuera,
      **reflectores** (`floodlight`, con charco de luz falso en el piso) y faroles en los muelles;
    - **cielo nuevo** (`Sky.js`) estilo shaderpack de Minecraft: sol y luna cuadrados con bloom,
      atardecer hacia el sol, franja rosa, cirros, estrellas cuadradas que titilan y aurora al norte.
      Se quitaron `Stars.js` y las nubes de malla (`Clouds.js`);
    - **criaturas** (`Fauna/Creatures.js`): ballena, mantarrayas o tiburón cada ~75 s, medusas que
      brillan de noche; **serpiente marina gigante** (`Fauna/Serpent.js`) que a veces cruza como
      sombra en la vista general. Ajustes en `world.js > fauna`.

23. **Celular y pantalla completa** (6 de noviembre de 2026):
    - **primera persona en celular**: no se podía mirar porque Android activaba el *pointer lock* al
      tocar 🎥 y se tragaba los toques; ahora en modo táctil nunca se bloquea. El eje vertical estaba
      invertido: ahora la vista sigue al dedo como el mouse (arriba = mirar arriba), con más rango;
    - botón de **pantalla completa** junto a ⚙ (PC y celular; se oculta donde no existe, como Safari de
      iPhone). El FPS se movió a la izquierda de ambos botones;
    - el **mapa** ya no se cierra al tocarlo: tiene una ✕ (y sigue cerrando con Tab/M o 🗺);
    - la **tarjeta de isla** tiene ✕ (se oculta hasta salir de la zona); la **de botes**, en celular, es
      una píldora con nombre y botón;
    - en celular ya no aparecen teclas: el botón del bote no dice "(Enter)", el aviso de cámara dice
      "arrastra para mirar" y el de pesca dice "toca «Tomar caña» arriba".
    - **avisos tocables en celular**: el aviso de arriba (Tomar caña, Encender luces, Sentarte…) es
      un botón; se quitaron los botones 💡 y 🎣. Con la caña en la mano, **TURBO se vuelve 🎣**
      (lanzar / recoger) gracias a la clase `has-rod` que pone `Fishing.setEquipped`.

24. **FPS: solo resolución adaptativa** (6 de noviembre de 2026), en `Quality.js`:
    - se probaron niveles automáticos y luego modos manuales (Rendimiento/Medio/Alta gama); **no le
      gustaron** (molestaban, y cambiar en vivo dejaba la pantalla celeste). Se quitaron (ver el punto 27:
      después pidió un solo **Modo rendimiento** que no baje la resolución);
    - Pausa → **Resolución** es una barra de 1 a 100 % de la resolución real de la pantalla (tope ×2).
      Es el máximo: si los FPS bajan de 55 la resolución baja sola (de golpe si la caída es grande,
      proporcional a √(fps/60), hasta ×0,5) y sube de a poco tras 3 medidas buenas;
    - MSAA solo en PC con pantalla de densidad 1; tilt-shift a media resolución; reflejos una vez por
      frame y del tamaño de la pantalla (`Water.setPixelRatio`); `Ticker.realDelta` para FPS reales.
25. **Apuntar y usar con F, mapa con viaje, bote inicial** (6 de noviembre de 2026):
    - **PC, primera persona**: al apuntar a una caña o a la consola sale una etiqueta al lado del objeto
      (`UI/AimLabel.js`): "F Tomar caña", "F Tomar el timón · L Encender luces". **F usa lo que apuntas**
      (`Character.aimedTarget`); si no apuntas a nada, F hace lo de siempre (caminar, sentarse);
    - **celular, primera persona**: el aviso de arriba solo muestra lo que apunta la mira; 🚶 tiene su
      botón y con caña TURBO es 🎣;
    - **mapa**: tocar una isla la marca y aparece "Ir a esta isla", que teletransporta el bote junto a su
      anillo de proyecto mirando a la isla (`Boat.teleport`);
    - el **bote inicial** es la Corvina 250 (`playerBoat: 'galileo-corvina'`). Si el jugador ya eligió
      otro en el astillero, se respeta lo guardado.
26. **PageSpeed móvil** (6 de noviembre de 2026). El informe de PageSpeed daba **NO_FCP** ("la página no
    ha renderizado ningún contenido") en todo. Cambios:
    - `main.js` es una entrada mínima (~1 KB): carga `Game.js` con `import()` (chunk aparte) y **espera
      a que el navegador reporte el primer pintado con contenido** (pantalla de inicio) antes de arrancar
      WebGL (tope 1 s). En PageSpeed (sin GPU) el WebGL arrancaba antes de esa pintura;
    - `Game.create` construye por pasos (`build()`) y cede el hilo entre núcleo, mundo, bote y UI
      (`scheduler.yield`). Cada paso deja una medida `boot:…` (User Timing) visible en DevTools;
    - `index.html`: meta description, favicon ⛵ en línea (antes 404), `<main>` en la pantalla de inicio,
      el viewport ya no bloquea el zoom (`touch-action: none` ya lo impide en el juego), texto inicial en
      el botón del astillero y `role="group"` en el joystick;
    - `vercel.json`: caché de un año para `/assets/*` (llevan hash). `public/robots.txt`;
    - **se probó y se descartó** `renderer.compileAsync()` antes del primer frame: bajaba el TBT de
      Lighthouse, pero "Zarpar" se habilitaba ~4 s más tarde y el primer frame igual congelaba ~1 s;
    - Lighthouse local (móvil): Accesibilidad, Prácticas y SEO en 100; Rendimiento ~0,7. Lo que queda es
      el TBT del primer frame (compilar shaders, ~1 s real) y el bundle de ~2 MB gzip.
27. **Resolución fija y Modo rendimiento** (6 de noviembre de 2026). **No le gusta que la resolución cambie
    sola** (en celular se notaba). Ahora:
    - la resolución es exactamente la de la barra **Resolución** (1–100 % de la pantalla real, tope ×2).
      **No volver a poner resolución automática**;
    - Pausa → **Modo rendimiento**: sin sombras (`shadowMap` y `castShadow` apagados), sin reflejos y sin
      tilt-shift, **con la misma resolución**. El bloom se queda. Viene encendido en celular y apagado en
      PC (se guarda la primera vez). Cambiarlo **recarga la página**, porque cambiar sombras o pases en
      vivo dejaba la pantalla celeste;
    - con el modo encendido, el interruptor "Reflejos en el agua" aparece deshabilitado.
28. **FPS en PC: sin MSAA, agua ligera** (6 de noviembre de 2026). En su PC los FPS eran malos y el modo
    rendimiento "era peor". Medido en esta laptop (AMD Radeon integrada, 1904×929, Chrome con GPU real):
    normal 19 FPS, modo rendimiento 21. Con 25 % de resolución, 99 FPS: el límite eran los píxeles.
    - **El MSAA era lo más caro.** Estaba encendido en PC con pantalla de densidad 1, y three lo aplica
      también al pase de escena (2 destinos MRT) y a las copias de pantalla del agua. Ahora se usa **FXAA**
      (una pasada al final, `Rendering.setPipeline`, casi sin costo). `?aa=fxaa|msaa|0` fuerza uno;
    - **el agua era lo segundo**: la refracción copia la pantalla y su profundidad cada frame. En modo
      rendimiento, `Water({ lite })` no copia nada: calcula la profundidad con la distancia a la orilla y
      deja ver el fondo, los peces y los arrecifes con mezcla alfa normal (sin el temblor de la refracción);
    - resultado en esa laptop: **modo rendimiento 56-74 FPS** (antes 21), **normal ~28** (antes 19).
      El normal sigue pesado en GPUs integradas (refracción, reflejos, sombras, tilt-shift);
    - para medir FPS en una GPU real: Chrome headless con `--enable-gpu --use-angle=d3d11` y CDP
      (el script estaba en el scratchpad). **Borrar el `--user-data-dir` temporal después de cada corrida**:
      llenaron el disco una vez.

29. **Pantalla de inicio estilo Bruno Simon** (10 de noviembre de 2026). Quería el *estilo* de la
    pantalla de carga de bruno-simon.com, no su contenido:
    - mientras carga: fondo morado oscuro con un anillo que pulsa (HTML);
    - cuando el juego dibuja: suelo oscuro con marcas × y líneas tenues, y un **disco brillante** alrededor
      del bote que crece; solo dentro de él se ve el mundo y lo que el disco corta brilla en el borde
      (`Rendering.introNode`, en el post-procesado);
    - texto a mano **"CLIC PARA ZARPAR"** (fuente Amatic SC de Google Fonts) con flecha hacia el bote y un
      altavoz que silencia o activa el sonido;
    - clic, Enter o Espacio: el disco se abre a todo el mundo en 2 s, la cámara se aleja de 21 a 42 m y pasa
      a la cámara guardada; luego el efecto se quita del pipeline para no costar FPS;
    - con `?post=off` no hay disco: el mundo se ve directo detrás del texto.

30. **Rendimiento por defecto, avisos e islas separadas** (10 de noviembre de 2026):
    - el **Modo rendimiento** empieza encendido para todos y al zarpar sale "⚡ Modo rendimiento activado"
      unos 4 s; si el jugador lo cambia en Pausa, se guarda su elección (`performanceChosen`);
    - el contador de peces (🐟 Tina) ya no es permanente: sale 3,5 s al zarpar y cuando cambia;
    - **en celular** los avisos de arriba solo salen al **apuntar en primera persona** a su objeto
      (timón → tomar timón / luces; caña → tomar caña) o mientras la línea está en el agua; levantarse y
      sentarse van por el botón 🚶;
    - **islas separadas ×1,6** desde la isla de inicio (había lag por tener todo junto y la serpiente marina
      cruzaba islas). El borde del mar pasó de 150 a 220 m y el mapa cubre 170 m;
    - la serpiente revisa **todo su recorrido** (cada 8 m) y solo sale si queda a 9 m o más de cualquier costa.
    - El bote inicial ya lo eligió el usuario (`playerBoat: 'galileo-corvina'`); el bote elegido en la
      exhibición sigue ganando sobre él.

31. **Sin caída de FPS al cambiar de cámara** (10 de noviembre de 2026). Cada cambio de cámara
    reconstruía todo el post-procesado (el tilt-shift solo existía en la vista general), lo que recompilaba
    bloom, desenfoque, color y FXAA. Ahora el tilt-shift siempre está en la cadena (si está activo) y se
    apaga con un uniform que se desvanece. **Regla: nunca llamar `setPipeline()` por algo que pase
    durante el juego**; usar uniforms.

32. **Multijugador, muelle grande, caminar en tierra, chat y emotes** (10 de noviembre de 2026). Pidió todo
    esto "sin arruinar nada y sin perder FPS":
    - **Salas de hasta 5 jugadores** (Pausa → 👥 Multijugador): "Crear sala" da un **código de 5 letras** y un
      **enlace** (`?sala=CODIGO`) para compartir; "Unirse" con el código. Tu nombre se guarda (`playerName`).
      Va navegador a navegador con **PeerJS** (WebRTC, servidor gratuito de peerjs.com, sin servidor propio);
      el que crea la sala es el anfitrión y reenvía todo. PeerJS (86 KB) solo se descarga al crear o unirse.
      Si el anfitrión se va, la sala se cierra. Arriba a la izquierda sale "👥 Sala CÓDIGO · 3/5";
    - los demás se ven con **su bote, su persona (con el color de su amarre) y su nombre encima**, suavizados
      (se dibujan 170 ms atrás, interpolando). Los botes chocan entre sí (collider cinemático). En el mapa
      salen como puntos de color con nombre;
    - **muelle grande (prop `marina`)** al sur de la isla de inicio: pasarela, cabezal en T y dedos con
      **5 amarres**, uno por jugador con su color. Todos empiezan ahí (al unirte a una sala vas a tu amarre).
      **R** te regresa a tu amarre. El anillo del proyecto de la isla se movió al este;
    - **bajarse y caminar** en cualquier isla: con el bote quieto junto a un muelle o una playa, **F** "Bajar al
      muelle / a tierra"; cerca del bote, **F** "Subir al bote". El bote queda amarrado (no se va a la deriva y
      el motor se apaga). En tierra chocas con palmeras, rocas, faroles y botes; puedes subir de la arena al pasto;
    - **Enter ya no abre proyectos: ahora es F** (E también sirve). **Enter es el chat**, fijo como Esc;
    - **chat estilo League of Legends abajo a la derecha**: Enter escribe, Enter envía, Esc cancela; los
      mensajes se desvanecen a los 10 s y al abrirlo se ve el historial. Sube solo si hay una tarjeta de
      proyecto en esa esquina. Solo, te avisa que crees una sala;
    - **T: rueda de emotes** (8: 👋 😂 😍 😎 😮 😡 👍 🎉, clic o 1–8); el emoji sale **grande sobre tu bote** (o
      tu cabeza en tierra) y lo ven todos;
    - celular: botones 💬 y 😀; bajarse/subir aparece como botón arriba;
    - FPS: lo nuevo es barato (la marina se fusiona por material, los botes remotos también, un sprite por
      emote reutilizado, la red va en un temporizador aparte).

33. **Correcciones del multijugador y puerto pesquero con economía** (10 de noviembre de 2026). Lo probó con un
    amigo:
    - **el bote del otro parpadeaba por dentro**: los botes con cubierta tienen una tapa invisible (solo escribe
      profundidad, `renderOrder` 10) para que no se vea el agua dentro del casco. Al fusionar el bote remoto con
      `mergeByMaterial` perdía su orden de dibujo. **Regla: `mergeByMaterial` ya no fusiona mallas con
      `renderOrder` ni de solo profundidad (`colorWrite: false`)**;
    - **se quitó el clic derecho** (prendía las luces en primera persona y cambiaba a primera persona en las otras
      cámaras). Las luces son L y pescar es G;
    - **mapa en primera persona (PC)**: al abrirlo se libera el mouse para poder tocar las islas; al cerrarlo se
      vuelve a bloquear;
    - **isla de inicio más grande (radio 18) con puerto pesquero**: frente a la marina hay dos puestos con
      vendedores (prop `stall`, personas sin mascarilla, con sombrero o delantal): **Cañas · Don Beto** y
      **Pescadería · Doña Marta**. Caminando frente al mostrador, **F** abre la tienda;
    - **economía**: cada pez tiene precio (`price` en `data/fish.js`; los grandes valen hasta ×1,4 y los chicos
      ×0,6). Especies nuevas: sardina, pez globo, mero, pez espada y el legendario pez luna. Rarezas con colores
      tipo Minecraft (común, poco común, raro, épico, legendario) según `chance`;
    - **6 cañas** (`data/rods.js`), cada una con **forma distinta** (bambú, fibra, telescópica, carbono, curricán
      y dorada) y estadísticas: **suerte** (peces raros más seguido y más grandes), **rapidez** (pican antes) y
      **reflejos** (más tiempo para recoger). La que compras es la que tienes en la mano;
    - **inventario estilo Minecraft** (`UI/InventoryPanel.js`): apunta a la **tina** en primera persona y **F**,
      o la tecla **I** (🎒 en celular). 9×4 casillas, una pila por especie (hasta 64), cuadro con rareza, peso y
      valor al pasar el mouse, y abajo tus cañas (clic para usarla). En la pescadería es el mismo panel en modo
      venta: clic en una pila la vende, o "Vender todo". Las monedas 🪙 se ven bajo el título;
    - se guarda en `localStorage` `portafolio-inventario` (lo de la tina vieja `portafolio-pesca` se pasó solo).
    - Mientras hay un panel abierto, las teclas del juego no hacen nada; Esc, E, I o F lo cierran.

34. **Pescar con clic, ropa y personaje** (10 de noviembre de 2026). **Pide respuestas cortas (gasta tokens).**
    - **PC: clic derecho lanza y recoge** (primera persona, mouse bloqueado). Se quitó la G (`fish` es fija, sin
      teclas; en celular sigue 🎣). F sigue tomando la caña que apuntas;
    - **E abre el inventario** (también I), en el bote o en tierra. Se quitó la acción "abrir proyecto con E": los
      anillos se usan con F;
    - el inventario muestra **tu personaje** (retrato pixelado), lo que llevas puesto (clic = quitar) y una fila
      **Ropa** (clic = ponerse);
    - **tercer puesto: Ropa · Lupita** (`kind: 'style'`), con maniquíes: **7 trajes y 6 sombreros**
      (`data/cosmetics.js`: paja, gorra, gorro, capitán, pirata, corona). Lo comprado se pone solo;
    - **los demás jugadores ven tu traje y sombrero** (campo `a` del estado de red).

35. **Multijugador corregido** (10 de noviembre de 2026). Fallas que vio jugando con su amigo:
    - **la sala ya no desaparece si el anfitrión se va**: el jugador con el slot más bajo toma el id de la sala y
      los demás se reconectan solos conservando su slot (migración de anfitrión, hasta 60 s de reintentos);
    - **día y noche iguales para todos**: el anfitrión manda su hora (`d`) y los demás la siguen;
    - **al entrar vas a un amarre vacío** (el anfitrión revisa qué amarres no tienen bote);
    - **choques entre botes con física**: ya no hay collider cinemático (era un muro inamovible y lanzaba lejos).
      Cada juego empuja solo su propio bote, como cápsulas, con ambas masas y velocidades
      (`RemotePlayers.collide`, cada paso de física). El bote remoto queda como sensor para no atravesarlo a pie;
    - **las luces del bote se ven en los demás** (`l` en el estado; los plafones remotos cambian de material);
    - **celular: botón 💡** junto a 🗺 y 🎥 en los botes con luces; L/💡 funcionan desde cualquier parte del bote.

### Errores visuales ya resueltos (por si reaparecen)

- **Borda negra que parpadeaba** (ferry y Corvina): compartía caras con la pared blanca. Ahora va
  encima (y = 1) con el hueco un poco más angosto.
- **Cuadro detrás de los letreros**: el sprite escribía profundidad y el agua detrás se teñía distinto.
  Los letreros usan `depthWrite: false`.

- **Parpadeo (z-fighting)** en los moldes y en las patas del travel lift: dos superficies de
  distinto color estaban exactamente en el mismo plano. La regla es dejar al menos ~1 cm de
  separación o usar el mismo material.
- **Techo translúcido "lechoso"**: eran cajas con 4 capas transparentes. Se cambiaron por
  planos de una sola capa.
- **Objetos flotando de cabeza**: la flotación debe ir al nivel del centro de masa, no debajo.

---

## 5. Valores útiles

**Parámetros de URL**:
- `#debug`: paneles Gráficos, Día y noche, Olas y viento, Física (ver colisiones), Terreno
  (editor) y Bote.
- `?fps`: muestra el contador de FPS.
- `?webgl`: fuerza WebGL2.
- `?post=off`: sin post-procesado.
- `?hora=noche`, `?hora=amanecer`, `?hora=dia` o `?hora=atardecer`: empieza a esa hora.

**Ajustes guardados** (localStorage `portafolio-settings`): `music`, `effects`, `mouseCamera`,
`steering`, `boat`, `camera`, `bindings`, `resolution` (0,01–1), `reflections`, `showFps` y
`playerName` (nombre en las salas). Aparte: `portafolio-inventario` (monedas, peces, cañas).

**Teclas por defecto**:

| Acción | Teclas |
|---|---|
| Navegar | WASD / flechas |
| Turbo | Shift |
| Reaparecer | R |
| Mapa | Tab / M |
| Abrir proyecto / usar bote | F (al timón) |
| Cambiar cámara | C / F5 |
| Usar: bajar al muelle / subir al bote, caminar, sentarse, timón, lo que apuntas | F |
| Chat (fijo) | Enter |
| Emotes | T (y 1–8 con la rueda abierta) |
| Inventario y personaje (también F apuntando a la tina) | E / I |
| Luces del bote | L |
| Pescar / recoger (Corvina, primera persona) | Clic derecho (🎣 en celular) |
| Pausa | Esc (fija) |

**Islas en `world.js`**: `inicio` (proyecto `about`, radio 18, **marina** de 5 amarres y **puerto** con tienda de cañas y pescadería), `astillero` (Botes Galileo),
`isla-dos`…`isla-cinco` (proyectos de ejemplo, **textos de relleno**) e `islote` (sin proyecto).

---

## 6. Cómo se prueba (notas para el asistente)

- En desarrollo existe `window.game` para inspeccionar desde la consola del navegador.
- **El panel del navegador integrado pausa `requestAnimationFrame` cuando está oculto.** Para
  probar, llama a `game.ticker.tick()` en un bucle propio, o muestra el panel.
- En ese panel las capturas a veces salen atrasadas; espera o verifica con datos
  (`getComputedStyle`, propiedades del juego).
- Los eventos de teclado sintéticos deben despacharse en `document.body` con
  `bubbles: true`. Si se despachan directo en `window`, no pasan por el listener de captura de
  Controles.
- Al editar con scripts de `node -e`, las comillas invertidas (backticks) se rompen en bash.
  Usa el editor o un script en un archivo aparte.
- Después de editar, revisa la sintaxis con `node --check archivo.js` y luego `pnpm build`.
- **Windows no distingue mayúsculas en los nombres**: `emotes.js` y `Emotes.js` son el mismo archivo (por eso
  la lista se llama `emoteList.js`). No uses dos nombres que solo cambien en mayúsculas.
- En esta PC no hay Python: para editar usa el editor o scripts de Node.
- **Lighthouse local**: `pnpm build`, levantar `preview` (puerto 4173, está en `.claude/launch.json`) y
  `npx lighthouse@12 http://localhost:4173/ --chrome-flags="--headless=new"` (móvil por defecto). La API
  de PageSpeed sin clave no tiene cuota. El TBT varía mucho entre corridas (3 a 12 s): compara varias.

---

## 7. Pendientes

- **Botes Galileo**: el enlace y la captura ya están; faltan sus colores de marca si los quiere.
- **Proyectos 2 a 5**: textos, enlaces y nombres de relleno en `data/projects.js`.
- **Más rendimiento** (siguientes pasos): bajar fauna/pájaros/luciérnagas en calidad Baja, no
  animar lo que está lejos o fuera de cámara, y medir con el perfilador de Chrome en un celular real.
- **Bundle grande** (~5 MB, casi todo el WASM de Rapier incrustado): se puede reducir pasando a
  `@dimforge/rapier3d` con `vite-plugin-wasm`, como hace Bruno.
- **Probar en dispositivos reales**: celular (controles táctiles), y medir FPS en el navegador
  normal (no en el panel de vista previa).
- **Economía**: ajustar precios de peces y cañas cuando lo juegue un rato; quizá más cosas que comprar
  (colores de bote, carnada).
- **Multijugador**: ya se probó con un amigo (se corrigió el parpadeo del bote remoto). Posibles siguientes pasos:
  migrar el anfitrión si se va, compartir la hora del día y las olas entre todos, servidor propio de
  PeerJS si el gratuito falla, y que las luces del bote de los demás se vean.
- **Ideas mencionadas o naturales**:
  - modelos de Blender (`.glb`) con un sistema `Resources`;
  - música real (Howler);
  - más interacciones con zonas (por ejemplo, cambiar el color del bote).

> **Nota multijugador (13 de noviembre de 2026)**: "no encontraba las salas". El servidor de PeerJS funcionaba;
> el juego cerraba la sala con `pagehide`, que el celular dispara al cambiar de app (p. ej. para mandar el código
> por WhatsApp). Ahora se usa `beforeunload` y al volver a la pestaña se reconecta al servidor. Se agregó
> "Salir ✕" en el indicador de sala, "Cancelar" mientras conecta, y el último código queda escrito (`lastRoom`).
> Las salas **no se guardan**: existen mientras haya alguien dentro y el código cambia en cada sala nueva.

> **TURN (13 de noviembre de 2026)**: el celular (datos móviles) no entraba a la sala de la PC. Los TURN que
> trae PeerJS (`eu-0/us-0.turn.peerjs.com`) **ya no existen** y openrelay.metered.ca está caído. Ahora
> `Network/iceServers.js` usa varios STUN (Google, Cloudflare) y un TURN propio desde variables de entorno:
> `VITE_METERED_APP` + `VITE_METERED_KEY` (cuenta gratis en metered.ca) o `VITE_TURN_URLS/USERNAME/CREDENTIAL`.
> Ver `.env.example`. **Ya hay cuenta Metered**: credenciales fijas en `.env.local` (`VITE_TURN_URLS`, relay
> `global.relay.metered.ca`). Pendiente: ponerlas también en Vercel.
