# AYNI: contrato de implementación

Trabajo local sobre React/Vite existente. API Express/TypeScript/MySQL en `backend`.
No se ejecutan migraciones sobre Aiven automáticamente. No hay respuestas de datos
simulados: sin base configurada la API devuelve un error explícito.

## Transporte compartido

- Base `/api`. JSON `{ data: ... }`; errores `{ error: { code, message, details? } }`.
- IDs enviados como strings. Consultas parametrizadas. Fechas en UTC.
- JWT en cookie HttpOnly; cliente `credentials: 'include'`, JSON y `X-AYNI-Client: web`
  para mutaciones. Validar Origin contra FRONTEND_ORIGIN; nunca tokens en localStorage.
- Auth: POST `/auth/register` body `{nombres,apellidos,correo,contrasena,telefono?,sectorId}`;
  POST `/auth/login` `{correo,contrasena}`; POST `/auth/logout`; GET `/auth/me`;
  PATCH `/auth/me` `{nombres?,apellidos?,telefono?,sectorId?}`.
- Usuario `{id,nombres,apellidos,correo,telefono,sectorId,sectorNombre}`.
- GET `/sectores`: array `{id,nombre,distrito,ciudad}`.
- GET `/catalogos`: `{publicaciones:[{id,nombre}],ayuda:[{id,nombre}],avisos:[{id,nombre}]}`.
- GET listas devuelve array en `data`, máximo 100 registros. Parámetros comunes:
  `q`, `sectorId`, `latitud`, `longitud`, `radio` (metros: 1000..2000), `mios=1`.
- Nunca exponer coordenadas de domicilio ni hash de contraseña. Mostrar sector y
  distancia aproximada cuando existe origen autorizado.

## Interfaces internas del backend

`src/db/index.ts`: export `pool` (mysql2/promise), `query<T>(sql, params?) => Promise<T[]>`,
`one<T>(sql, params?) => Promise<T|undefined>`, `transaction(fn)` con conexión
PoolConnection. Pool solo conecta al usarlo, TLS verificado si está configurado.
`src/middlewares/auth.ts`: export `requireAuth`, añade `req.userId: string`.
`src/lib/http.ts`: export `AppError(status, code, message)`, `asyncHandler(handler)`.
`src/lib/validation.ts`: la implementación de cada módulo puede usar zod directamente.
`src/routes/community.ts`: default export router, montado en `/api`.

## Publicaciones y avisos

- GET/POST `/publicaciones`; GET/PATCH `/publicaciones/:id`.
- Publicación `{id,propietarioId,propietario,categoriaId,categoria,tipo,titulo,descripcion,
  modalidadPrecio,precio,moneda,estado,sectorId,sectorNombre,distanciaMetros,
  promedioResenas,totalResenas}`. GET `/publicaciones/:id/resenas`.
- POST `{categoriaId,tipo,titulo,descripcion?,modalidadPrecio,precio?,sectorId}`.
- GET/POST `/avisos`; GET/PATCH `/avisos/:id`.
- Aviso `{id,autorId,autor,categoriaId,categoria,titulo,contenido,estado,sectorId,
  sectorNombre,fechaEvento,venceEn,creadoEn}`.
- POST `{categoriaId,titulo,contenido,sectorId,fechaEvento?,venceEn?}`.

## Ayuda

- GET/POST `/solicitudes`; GET/PATCH `/solicitudes/:id`.
- Solicitud `{id,solicitanteId,solicitante,categoriaId,categoria,sectorId,sectorNombre,
  titulo,descripcion,urgencia,estado,creadoEn,distanciaMetros,clientRequestId}`.
- POST `{clientRequestId,categoriaId,sectorId,titulo,descripcion,urgencia}`.
  Unicidad por solicitante + UUID, con huella del contenido original y conflicto si cambia.
- PATCH `{accion:'completar'|'cancelar',motivo?}`.
- GET/POST `/solicitudes/:id/ofertas`. POST `{mensaje}` (describe el aporte).
- Oferta `{id,solicitudId,voluntarioId,voluntario,mensaje,estado,entregaPendiente,
  confirmadaEn,resena?:{id,calificacion,comentario}}`.
  Se preservan ENUM existentes: pendiente=propuesta; aceptada + entregada_en=entrega
  pendiente; completada=confirmada. rechazada/retirada representan cancelación según actor.
- PATCH `/ofertas/:id` `{accion:'aceptar'|'rechazar'|'retirar'|'entregar'|'confirmar'}`.
- PUT `/ofertas/:id/resena` `{calificacion,comentario?}`, solo solicitante tras confirmación.
- GET `/usuarios/:id/reputacion` => `{colaboracionesConfirmadas,vistosBuenos,promedio,
  resenas:[{id,autor,calificacion,comentario,creadoEn}]}`. Visto bueno: calificación >=4.
- Varias aceptadas permitidas. Aceptación bloquea solicitud; entrega no la completa.
  Cerrar solicitud con aportes aceptados sin confirmar devuelve 409; propuestas pendientes
  se rechazan al cerrar. Reabrir si no quedan aportes aceptados ni confirmados.

## Recursos

- GET/POST `/recursos`; POST `/recursos/:id/reservas`; GET `/recursos/:id/reservas`;
  PATCH `/reservas/:id` `{accion:'confirmar'|'entregar'|'cancelar'}`.
- Recurso `{id,propietarioId,propietario,titulo,unidad,cantidadTotal,reservada,entregada,
  disponible,sectorId,sectorNombre,actualizadoEn}`.
- POST recurso `{titulo,unidad,cantidadTotal,sectorId}`;
  POST reserva `{cantidad,solicitudId?,clientRequestId}`.
- Recurso bloqueado al confirmar reserva/entregar/cancelar. Reservada se descuenta solo
  tras aceptación del dueño. Repeticiones no descuentan dos veces. Recursos MVP consumibles
  o donados; préstamos de herramientas siguen el flujo de colaboraciones.

## Alcance de verificación

Compilación y pruebas automatizadas locales. Pruebas MySQL habilitadas únicamente con
base de prueba expresamente configurada, sin borrar ni recrear datos existentes.
