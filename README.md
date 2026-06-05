# SIMPLE 2.5D

Convierte un PNG transparente en un personaje 2.5D que puedes posar y exportar — sin software 3D, sin experiencia en rigging.

Subes una imagen de tu personaje, la divides en partes con nombre (cabeza, brazo, pierna, etc.), le pones un punto de movimiento a cada parte, las ordenás por capas, y exportás todo como PNGs individuales más un archivo JSON con la estructura del rig.

Si este proyecto te sirve o querés apoyar su desarrollo, podés invitarme un café:

<a href="https://buymeacoffee.com/devalan" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Invítame un café en buymeacoffee.com" width="180">
</a>

---

## Estado actual

En desarrollo activo — v1 funcional. El editor ya soporta carga de PNG, creación de partes con nombre, puntos de movimiento (pivotes), ordenamiento de capas, previsualización de rotación, guardado/carga local, y exportación completa (PNGs recortados + JSON del rig + ZIP).

---

## Requisitos

Necesitás tener instalado esto antes de empezar:

- **Node.js 18 o superior** — [nodejs.org](https://nodejs.org). Después de instalarlo, corrés `node -v` para confirmar. Deberías ver algo como `v20.x.x`.
- **pnpm** — el gestor de paquetes que usa este proyecto. Lo instalás con:
  ```bash
  npm install -g pnpm
  ```
  Luego `pnpm -v` para confirmar que funciona.

> **¿Por qué pnpm?** Es más rápido y usa menos espacio en disco que npm. Este proyecto usa `pnpm-lock.yaml` en lugar de `package-lock.json`. Si intentás usar npm o yarn acá, va a dar error — usá pnpm.

---

## Instalación

```bash
# Cloná el repositorio
git clone https://github.com/cloudzeroxyz/simple-2-5d.git
cd simple-2-5d

# Instalá las dependencias
pnpm install
```

---

## Correr la app

```bash
pnpm dev
```

Abrí [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## Build para producción

```bash
pnpm build
pnpm start
```

---

## Estructura de carpetas

```
app/                 Páginas del App Router de Next.js
  page.tsx           Inicio / landing
  new/page.tsx       Pantalla de nuevo personaje
  editor/page.tsx    Editor principal (canvas)
  export/page.tsx    Pantalla de exportación
components/
  editor/            Componentes de UI del editor (canvas, toolbar, sidebar)
lib/
  storage.ts         Helpers para guardar y cargar desde localStorage
  export.ts          Exportación client-side: PNGs recortados, JSON y ZIP
types/
  rig.ts             Tipos TypeScript para los datos del rig
```

---

## Qué hace la app (v1)

- Cargás un PNG transparente de tu personaje
- Seleccionás y nombrás cada parte del cuerpo dibujando rectángulos (cabeza, torso, brazo izquierdo, etc.)
- Le ponés un punto de movimiento (pivote) a cada parte
- Ordenás las partes por capas (adelante / atrás)
- PreVisualizás la rotación de cada parte alrededor de su pivote
- Guardás el trabajo en el localStorage del navegador — sin cuenta ni servidor
- Exportás: recortes PNG de cada parte, un archivo JSON del rig, o un ZIP con todo junto

---

## Exportar tu personaje

Una vez que creaste y ordenaste tus partes, usás el botón **Export** en el editor.

Hay tres opciones:

- **Rig data (JSON)** — todas las partes con sus bounding boxes, puntos de movimiento, rotación, orden de capas y visibilidad. Incluye las partes ocultas marcadas como `isVisible: false`. Este archivo es lo que leería un motor de juego u otra herramienta para reconstruir el personaje.
- **PNG parts** — cada parte visible exportada como un recorte PNG transparente de la imagen original. Un archivo por parte. Los PNGs no tienen rotación aplicada — la rotación está en el JSON.
- **Full bundle (ZIP)** — todos los recortes PNG más el JSON del rig en un solo archivo. La opción más cómoda si querés llevarte todo de una vez.

Todo se ejecuta localmente en tu navegador — no se sube nada a ningún servidor.

---

## Guardado local

Tu proyecto se guarda en el **localStorage** de tu navegador cuando hacés clic en Guardar. La próxima vez que abrís el editor en el mismo navegador, se carga automáticamente.

Algunas cosas a tener en cuenta:

- El localStorage tiene un límite (normalmente alrededor de 5 MB por sitio). Los PNGs muy grandes pueden no poder guardarse — el editor te avisa si eso pasa. En ese caso, probá con una imagen más pequeña.
- Si limpiás los datos del navegador, el proyecto guardado se borra. Usá el botón de exportación para tener una copia permanente.

---

## Qué NO incluye (intencional)

- Sin cuentas ni login — todo corre en tu navegador, localmente
- Sin servidor backend para el editor
- Sin base de datos
- Sin funciones de IA en v1
- Sin motor 3D ni línea de tiempo de animación
- Sin claves de API externas requeridas

---

## Dependencias

Las dependencias estándar (Next.js, React, Tailwind, TypeScript) no necesitan explicación. Hay dos menos comunes:

- **[Konva.js](https://konvajs.org/) + react-konva** — librería de canvas 2D que se usa para renderizar la imagen del personaje y los overlays de las partes en el editor. Se usa `react-konva@18` fijado a esa versión para que coincida con React 18. No requiere instalación extra — viene con `pnpm install`.
- **[fflate](https://github.com/101arrowz/fflate)** — librería ZIP pequeña (~13 KB), sin dependencias propias, que funciona directamente en el navegador. Se usa para la opción "Export ZIP". No necesita Node.js ni nada nativo — también viene con `pnpm install`.

---

## Open source

Este proyecto es público y open source. Podés clonarlo, bifurcarlo y usarlo libremente.

---

## Contribuir

Las contribuciones son bienvenidas. Si querés agregar algo, abrí un issue primero para discutirlo — especialmente si es un cambio grande. Mantenelo simple y dentro del alcance de lo que esta herramienta hace.

---

## Apoyar el proyecto

Si SIMPLE 2.5D te fue útil, podés apoyar el proyecto acá:

<a href="https://buymeacoffee.com/devalan" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Invítame un café en buymeacoffee.com" width="180">
</a>

---

## Licencia

MIT — ver [LICENSE](LICENSE).
