# Tab & Bookmark Manager

Extensión de Chrome para organizar pestañas y marcadores en grupos, inspirada en [Toby](https://www.gettoby.com/). Reemplaza la página de "Nueva pestaña" por un panel central donde puedes guardar, agrupar y volver a abrir tus pestañas.

## Características

- Grupos de bookmarks en una sola vista central (no hay que andar cambiando de "colección").
- Arrastra pestañas abiertas directo a un grupo, o arrastra tarjetas entre grupos para reordenarlas.
- Clic derecho en cualquier página → "Guardar en Tab Manager" para agregarla a un grupo sin abrir el gestor.
- Editar título/URL de un bookmark ya guardado.
- Buscador que filtra grupos y bookmarks, resalta coincidencias y se navega con las flechas ←/→ + Enter.
- Exportar/importar tus datos como `.json` (incluye soporte para leer archivos exportados desde Toby).
- Deshacer al borrar un grupo o un bookmark.
- Panel de "Pestañas abiertas" colapsable.

## Instalación (modo desarrollador)

Esta extensión no tiene proceso de build: es JavaScript plano, se carga tal cual.

1. Clona o descarga este repositorio.
2. Abre `chrome://extensions` en Chrome.
3. Activa **Modo de desarrollador** (interruptor arriba a la derecha).
4. Haz clic en **Cargar descomprimida** (Load unpacked) y selecciona la carpeta del proyecto.
5. Abre una pestaña nueva — ahí aparece el gestor.

Para actualizar la extensión después de hacer cambios en el código: entra a `chrome://extensions` y dale al botón de recargar (⟳) en la tarjeta de la extensión.

## Uso rápido

- **Pestaña nueva**: panel principal con todos tus grupos y bookmarks.
- **Ícono de la extensión** (barra de herramientas): guarda de un clic todas las pestañas abiertas de la ventana actual como un grupo nuevo.
- **Clic derecho en una página o enlace**: guárdalo directo en un grupo existente.

## Dónde se guardan tus datos

Todo se guarda en `chrome.storage.local`, es decir, **local a ese perfil de Chrome en esa computadora** — no se sincroniza solo entre equipos. Para llevar tus datos a otra máquina usa los botones **Exportar** / **Importar** del sidebar (genera un archivo `.json`).

## Estructura del proyecto

```
manifest.json          Configuración de la extensión (Manifest V3)
background.js           Service worker: menú contextual "Guardar en Tab Manager"
lib/storage.js           Toda la lógica de datos (chrome.storage.local)
newtab/                  Panel principal (reemplaza la pestaña nueva)
popup/                   Popup rápido de la barra de herramientas
```

## Permisos que pide

- `tabs` — leer pestañas abiertas para mostrarlas/guardarlas.
- `storage` — guardar tus grupos y bookmarks localmente.
- `favicon` — mostrar el ícono de cada sitio usando el caché de Chrome (evita fallos de carga en sitios con login).
- `contextMenus` — el menú de clic derecho "Guardar en Tab Manager".
