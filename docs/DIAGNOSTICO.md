# Diagnóstico inicial y decisiones de integración

El repositorio original es una SPA web React 19 + TypeScript, Vite 8 y Tailwind 4.
No es React Native/Expo. Contenía App.tsx (pantallas, iconos y datos de demostración),
ServicesMap.tsx, main.tsx e index.css; navegación mediante estado local, sin router.

## A. Reutilizable

Identidad AYNI, colores/tipografías, tarjetas, navegación móvil/escritorio, iconos SVG,
búsqueda local, lectura de texto, mapa incrustado y estilos de accesibilidad/movimiento.

## B. Necesitaba integración

Pantallas Cerca de mí, Ayuda vecinal, Avisos y Perfil. Datos estáticos, usuario fijo,
botones que solo mostraban mensajes, formulario que ignoraba el texto escrito y estado
de conexión simulado. No había servicio HTTP ni gestión de sesión.

## C. Por desarrollar al inicio

API, autenticación, persistencia MySQL, permisos, colaboraciones con varios participantes,
confirmaciones, reseñas verificadas, inventario y reservas, cola offline idempotente,
formularios de publicación, estados de carga/error y documentación de ejecución.

## Mapa pantalla → API

| Pantalla | Endpoints principales |
|---|---|
| Acceso / perfil | `/auth/register`, `/auth/login`, `/auth/me`, `/auth/logout`, `/usuarios/:id/reputacion` |
| Cerca de mí | `/publicaciones`, `/publicaciones/:id`, `/publicaciones/:id/resenas`, `/sectores`, `/catalogos` |
| Ayuda vecinal | `/solicitudes`, `/solicitudes/:id/ofertas`, `/ofertas/:id`, `/ofertas/:id/resena` |
| Recursos comunitarios | `/recursos`, `/recursos/:id/reservas`, `/reservas/:id` |
| Avisos | `/avisos`, `/avisos/:id` |

Se mantiene React/Vite, sin migración de framework. El build ahora comprueba TypeScript
y no depende de un archivo Figma ignorado por Git. La persistencia local usa IndexedDB
en lugar de SQLite; la API sigue siendo la única fuente de confirmación de publicación.

## Distribución del equipo

1. Frontend: `src/` (pantallas, formularios, API y almacenamiento local).
2. Base backend: `backend/src/db`, `middlewares`, `routes/auth.ts`, configuración.
3. Comunidad: `routes/community.ts`, `services/community*`, migraciones.
4. Integración: pruebas, scripts, contratos y documentación.

Coordinar cambios de contrato en API.md antes de modificar cliente y servidor.
