# Contexto del proyecto (para continuar en un chat nuevo)

> Pega o adjunta este archivo al empezar un chat nuevo. Resume todo lo hablado y construido
> hasta el 6 de noviembre de 2026. Los detalles técnicos de cada sistema están en
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
   ├─ UI/           StartScreen, ProjectCard, BoatCard, PauseMenu, ControlsPanel,
   │                KeyHints, WorldMap, CameraToast
   └─ utils/        schema (validación), merge, random, pointer, keys
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
  `body` (física dinámica) y `animated` (tiene `update()`).
- **Sistemas y piezas**: un *sistema* usa `Game.getInstance()` y se registra en el ticker o en
  eventos; una *pieza* recibe sus datos por parámetro.
- **Tiempo de juego y tiempo real separados**: `ticker.gameDelta` y `ticker.elapsed` se
  congelan en pausa; `ticker.delta` es el tiempo real.

### Eventos principales

`tick`, `start`, `pause`, `content:change`, `world:build`, `zone:change` (payload
`{type:'project'|'boat', …}`), `interact` (Enter), `settings:change`, `quality:change`,
`camera:change`, `ui:click` y `action:<nombre>`.

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
   - Calidad adaptativa (`Quality.js`).
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

24. **Calidad automática para 60 FPS** (6 de noviembre de 2026), en `Quality.js`:
    - 3 niveles (`TIERS`): **Baja** (sin sombras, sin reflejos, sin bloom, resolución ×1),
      **Media** (sombras 1024, reflejos 25 %, bloom, ×1,25) y **Alta** (sombras 2048, reflejos 40 %,
      bloom, tilt-shift, ×1,5);
    - empieza en Media en celular y Alta en PC. Cada 1,5 s mide los FPS reales: debajo de 50 baja un
      nivel (y no vuelve a subir a ese), y solo en el nivel más bajo reduce la resolución. Con
      más de 58 sube la resolución y, tras 3 medidas buenas, el nivel. Ignora las 2 primeras medidas
      tras cada cambio (los shaders compilan);
    - ajuste **Calidad** en Pausa (Automática / Baja / Media / Alta); `?quality=low|medium|high` la fija;
    - evento `quality:tier`: `Rendering` (bloom, tilt-shift), `Lighting` (sombras) y `World` (reflejos);
    - `Ticker.realDelta` (sin límite) para medir FPS reales; el contador muestra el nivel;
    - la mira de pesca hace el raycast 15 veces por segundo, no en cada frame.

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
- `?quality=low` / `?quality=medium` / `?quality=high`: fija la calidad.
- `?webgl`: fuerza WebGL2.
- `?post=off`: sin post-procesado.
- `?hora=noche`, `?hora=amanecer`, `?hora=dia` o `?hora=atardecer`: empieza a esa hora.

**Ajustes guardados** (localStorage `portafolio-settings`): `music`, `effects`, `mouseCamera`,
`steering`, `boat`, `camera`, `bindings`, `resolution`, `quality`, `reflections` y `showFps`.

**Teclas por defecto**:

| Acción | Teclas |
|---|---|
| Navegar | WASD / flechas |
| Turbo | Shift |
| Reaparecer | R |
| Mapa | Tab / M |
| Abrir proyecto / usar bote | Enter / E |
| Cambiar cámara | C / F5 |
| Caminar / sentarse / timón | F |
| Luces del bote | L |
| Pescar / recoger (Corvina, primera persona) | G / clic derecho |
| Pausa | Esc (fija) |

**Islas en `world.js`**: `inicio` (proyecto `about`), `astillero` (Botes Galileo),
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
- **Ideas mencionadas o naturales**:
  - modelos de Blender (`.glb`) con un sistema `Resources`;
  - música real (Howler);
  - más interacciones con zonas (por ejemplo, cambiar el color del bote).
