# SIMPLE 2.5D

Convierte un PNG transparente en un personaje 2.5D que puedes posar y exportar — sin software 3D, sin experiencia en rigging.

Subes una imagen de tu personaje, la divides en partes con nombre (cabeza, brazo, pierna, etc.), le asignas un punto de movimiento a cada parte, las ordenas por capas, y exportas todo como PNGs individuales más un archivo JSON con la estructura del rig.

Si este proyecto te sirve o quieres apoyar su desarrollo, puedes invitarme un café:

<a href="https://buymeacoffee.com/devalan" target="_blank" rel="noopener noreferrer">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Invítame un café en Buy Me a Coffee" width="180">
</a>

---

## Estado actual

En desarrollo activo — v1 funcional. El editor ya soporta carga de PNG, creación de partes con nombre, puntos de movimiento (pivotes), ordenamiento de capas, previsualización de rotación, guardado/carga local, y exportación completa (PNGs recortados + JSON del rig + ZIP).

---

## Requisitos

Necesitas tener instalado esto antes de empezar:

- **Node.js 18 o superior** — [nodejs.org](https://nodejs.org). Después de instalarlo, ejecuta `node -v` para confirmar. Deberías ver algo como `v20.x.x`.
- **pnpm** — el gestor de paquetes que usa este proyecto. Lo instalas con:
  ```bash
  npm install -g pnpm
  ```
  Luego ejecuta `pnpm -v` para confirmar que funciona.

> **¿Por qué pnpm?** Es más rápido y usa menos espacio en disco que npm. Este proyecto usa `pnpm-lock.yaml` en lugar de `package-lock.json`. Si intentas usar npm o yarn aquí, va a dar error — usa pnpm.

---

## Instalación

```bash
# Clona el repositorio
git clone https://github.com/cloudzeroxyz/simple-2-5d.git
cd simple-2-5d

# Instala las dependencias
pnpm install
```

---

## Ejecutar la app

```bash
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

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

- Cargas un PNG transparente de tu personaje
- Seleccionas y nombras cada parte del cuerpo dibujando rectángulos (cabeza, torso, brazo izquierdo, etc.)
- Le asignas un punto de movimiento (pivote) a cada parte
- Ordenas las partes por capas (adelante / atrás)
- Previsualizas la rotación de cada parte alrededor de su pivote
- Guardas el trabajo en el localStorage del navegador — sin cuenta ni servidor
- Exportas: recortes PNG de cada parte, un archivo JSON del rig, o un ZIP con todo junto

---

## Exportar tu personaje

Una vez que creaste y ordenaste tus partes, haz clic en el botón **Export** en el editor.

Hay tres opciones:

- **Rig data (JSON)** — todas las partes con sus bounding boxes, puntos de movimiento, rotación, orden de capas y visibilidad. Incluye las partes ocultas marcadas como `isVisible: false`. Este archivo es lo que leería un motor de juego u otra herramienta para reconstruir el personaje.
- **PNG parts** — cada parte visible exportada como un recorte PNG transparente de la imagen original. Un archivo por parte. Los PNGs no tienen rotación aplicada — la rotación está guardada en el JSON.
- **Full bundle (ZIP)** — todos los recortes PNG más el JSON del rig en un solo archivo. La opción más cómoda si quieres llevarte todo de una vez.

Todo se ejecuta localmente en tu navegador — no se sube nada a ningún servidor.

---

## Guardado local

Tu proyecto se guarda en el **localStorage** de tu navegador cuando haces clic en Guardar. La próxima vez que abres el editor en el mismo navegador, se carga automáticamente.

Algunas cosas a tener en cuenta:

- El localStorage tiene un límite (normalmente alrededor de 5 MB por sitio). Los PNGs muy grandes pueden no guardarse — el editor te avisa si eso pasa. En ese caso, prueba con una imagen más pequeña.
- Si limpias los datos del navegador, el proyecto guardado se elimina. Usa el botón de exportación para tener una copia permanente.

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

- **[Konva.js](https://konvajs.org/) + react-konva** — librería de canvas 2D que se usa para renderizar la imagen del personaje y los overlays de las partes en el editor. Se usa `react-konva@18` fijado a esa versión para que coincida con React 18. No requiere instalación extra — viene incluida con `pnpm install`.
- **[fflate](https://github.com/101arrowz/fflate)** — librería ZIP pequeña (~13 KB), sin dependencias propias, que funciona directamente en el navegador. Se usa para la opción "Export ZIP". No necesita Node.js ni nada nativo — también viene incluida con `pnpm install`.

---

## Open source

Este proyecto es público y open source. Puedes clonarlo, bifurcarlo y usarlo libremente.

---

## Contribuir

Las contribuciones son bienvenidas. Si quieres agregar algo, abre un issue primero para discutirlo — especialmente si es un cambio grande. Mantenlo simple y dentro del alcance de lo que esta herramienta hace.

---

## Apoyar el proyecto

Si SIMPLE 2.5D te fue útil, puedes apoyar el proyecto aquí:

<a href="https://buymeacoffee.com/devalan" target="_blank" rel="noopener noreferrer">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Invítame un café en Buy Me a Coffee" width="180">
</a>

---

## Licencia

MIT — ver [LICENSE](LICENSE).
