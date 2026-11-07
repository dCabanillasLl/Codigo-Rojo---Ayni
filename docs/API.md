# API AYNI

Base `/api`, JSON UTF-8. IDs como cadenas; fechas UTC. Éxito `{ "data": ... }`.
Error `{ "error": { "code": "...", "message": "...", "details": [...] } }`.
`details` es opcional y contiene campos de validación, nunca contraseñas ni SQL.

## Sesión y transporte

La sesión usa cookie HttpOnly. En fetch: `credentials: 'include'`.
Toda mutación requiere `Content-Type: application/json`, `X-AYNI-Client: web` y un
`Origin` incluido en `FRONTEND_ORIGIN`. El navegador añade Origin automáticamente.
`X-AYNI-User` permite indicar la identidad esperada al sincronizar; si difiere de la
sesión autenticada se devuelve 409 `SESSION_CHANGED`. No autentica por sí misma.

Estados generales: 400 validación, 401 sesión ausente/caducada, 403 permiso u origen,
404 inexistente/no visible, 409 conflicto, 413 cuerpo demasiado grande, 415 formato,
429 límite de peticiones, 503 base/configuración/esquema no disponibles.
Los endpoints autenticados rechazan cuentas suspendidas o eliminadas.

## Autenticación

| Método y ruta | Cuerpo / resultado | Éxito |
|---|---|---|
| POST `/auth/register` | `{nombres,apellidos,correo,contrasena,sectorId,telefono?,latitud?,longitud?}` → usuario y cookie | 201 |
| POST `/auth/login` | `{correo,contrasena}` → usuario y cookie | 200 |
| GET `/auth/me` | Usuario de la sesión | 200 |
| PATCH `/auth/me` | `{nombres?,apellidos?,telefono?,sectorId?,latitud?,longitud?}` → usuario actualizado | 200 |
| POST `/auth/logout` | `{}` → `{cerrado:true}`, elimina cookie | 200 |

Usuario: `{id,nombres,apellidos,correo,telefono,sectorId,sectorNombre}`. Correo y teléfono
solo se devuelven al propio usuario. El registro valida contraseña y límites de texto;
correo/teléfono únicos. Coordenadas opcionales, siempre juntas y con sector; nunca se
devuelven al público. Errores: `INVALID_CREDENTIALS`, `INVALID_SECTOR`, `DUPLICATE`,
`AUTH_NOT_CONFIGURED`, `VALIDATION_ERROR`. No hay recuperación de contraseña por correo.

## Catálogos

| Ruta GET | Resultado |
|---|---|
| `/health` | Estado de API/base/esquema; 503 si no están listos |
| `/sectores` | `[{id,nombre,distrito,ciudad}]` |
| `/catalogos` | `{publicaciones:[{id,nombre}],ayuda:[{id,nombre}],avisos:[{id,nombre}]}` |

## Listados y cercanía

Los listados devuelven arrays, máximo 100 registros. Filtros comunes: `q`, `sectorId`,
`categoriaId`, `mios=1`, `latitud`, `longitud`, `radio` (1000–2000 metros, por defecto
1000). Coordenadas siempre juntas; bounding box y distancia geográfica se calculan
en servidor. `distanciaMetros` se redondea a 50 m y es null cuando no se conoce.
Los filtros de sector y radio se combinan si se proporcionan ambos.
`mios=1` exige sesión y permite consultar estados no publicados propios.

## Publicaciones

| Método y ruta | Entrada / operación | Éxito |
|---|---|---|
| GET `/publicaciones` | Filtros comunes y `tipo=producto|servicio` | 200 |
| POST `/publicaciones` | `{categoriaId,tipo,titulo,descripcion?,modalidadPrecio,precio?,sectorId,estado?}` | 201 |
| GET `/publicaciones/:id` | Detalle público publicado o propio | 200 |
| PATCH `/publicaciones/:id` | Campos editables de creación, al menos uno; solo propietario | 200 |
| GET `/publicaciones/:id/resenas` | Reseñas de la publicación, `verificada:false` | 200 |

Publicación: `{id,propietarioId,propietario,categoriaId,categoria,tipo,titulo,descripcion,
modalidadPrecio,precio,moneda,estado,sectorId,sectorNombre,distanciaMetros,
promedioResenas,totalResenas}`. Modalidades `gratis|fijo|desde|cotizar`; fijo/desde
requieren precio no negativo con hasta dos decimales, gratis/cotizar requieren precio
nulo/omitido. Estados `borrador|publicada|pausada|archivada`. Por defecto se publica.
Errores específicos: `PRICE_REQUIRED`, `INVALID_PRICE`, `INVALID_SECTOR`.

## Solicitudes de ayuda

| Método y ruta | Entrada / operación | Éxito |
|---|---|---|
| GET `/solicitudes` | Filtros comunes; `participando=1` para colaboraciones del usuario | 200 |
| POST `/solicitudes` | `{clientRequestId,categoriaId,sectorId,titulo,descripcion,urgencia}` | 201 o 200 si reintento |
| GET `/solicitudes/:id` | Detalle | 200 |
| PATCH `/solicitudes/:id` | `{accion:'completar'}` o `{accion:'cancelar',motivo}`; solo solicitante | 200 |

Solicitud: `{id,solicitanteId,solicitante,categoriaId,categoria,sectorId,sectorNombre,
titulo,descripcion,urgencia,estado,creadoEn,distanciaMetros,clientRequestId}`.
Urgencia `normal|urgente`; estados `abierta|en_curso|completada|cancelada|vencida`.
La creación guarda UUID + huella del contenido: mismo usuario/UUID/contenido devuelve
el original; distinto contenido produce 409. No se debe generar otro UUID al reintentar.
Completar requiere resolver aportes aceptados pendientes de recepción; las propuestas
pendientes se rechazan al cerrar. Cancelar requiere motivo.

## Colaboraciones y recomendaciones

| Método y ruta | Entrada / operación | Éxito |
|---|---|---|
| GET `/solicitudes/:id/ofertas` | Solicitante ve todas; voluntario ve las propias | 200 |
| POST `/solicitudes/:id/ofertas` | `{mensaje}` describe el aporte; no ofrecerse a uno mismo | 201 |
| PATCH `/ofertas/:id` | `{accion:'aceptar'|'rechazar'|'retirar'|'entregar'|'confirmar'}` | 200 |
| PUT `/ofertas/:id/resena` | `{calificacion,comentario?}`; solicitante tras confirmar recepción | 200 |
| GET `/usuarios/:id/reputacion` | `{colaboracionesConfirmadas,vistosBuenos,promedio,resenas}` | 200 |

Oferta: `{id,solicitudId,voluntarioId,voluntario,mensaje,estado,entregaPendiente,
confirmadaEn,resena}`. Se conservan ENUM originales:

- `pendiente`: propuesta; solicitante acepta/rechaza y voluntario retira.
- `aceptada`: aporte acordado. Voluntario marca entrega, solicitante confirma recepción.
- `aceptada` + `entregaPendiente:true`: el vecino indicó que entregó, falta confirmar.
- `completada` + `confirmadaEn`: recepción confirmada. Habilita reseña.
- `rechazada`/`retirada`: cancelación, distinguiendo actor.

Varias ofertas pueden aceptarse. Las transiciones se realizan en transacciones con
bloqueo del pedido; entregar/confirmar no completa automáticamente la necesidad.
Una sola reseña editable por colaboración, calificación 1–5. Vistos buenos cuentan
calificaciones 4–5 de colaboraciones confirmadas. Las identidades se derivan de la
solicitud y la oferta; el cliente no elige al autor ni al evaluado.
Estados incompatibles o cierre con aportes pendientes producen 409; actor incorrecto, 403.

## Recursos compartidos

| Método y ruta | Entrada / operación | Éxito |
|---|---|---|
| GET `/recursos` | Listado y filtros comunes | 200 |
| POST `/recursos` | `{titulo,unidad,cantidadTotal,sectorId}` | 201 |
| GET `/recursos/:id/reservas` | Dueño ve todas; solicitante ve las propias | 200 |
| POST `/recursos/:id/reservas` | `{clientRequestId,cantidad,solicitudId?}` | 201 o 200 si reintento |
| PATCH `/reservas/:id` | `{accion:'confirmar'|'entregar'|'cancelar'}` | 200 |

Recurso: `{id,propietarioId,propietario,titulo,unidad,cantidadTotal,reservada,entregada,
disponible,sectorId,sectorNombre,actualizadoEn}`. Cantidades enteras positivas.
Reserva: `{id,recursoId,solicitanteId,solicitante,cantidad,estado,creadoEn,...}`.
Estados `pendiente|reservada|entregada|cancelada`. Dueño confirma reserva y entrega;
dueño o solicitante pueden cancelar antes de entregar. Una solicitud vinculada debe
pertenecer a quien reserva. No se permite reservar recursos propios.

Disponible = total − reservadas − entregadas. Las pendientes no consumen inventario.
Se bloquea el recurso antes de cambiar reservas; dos confirmaciones concurrentes no
pueden consumir las mismas unidades. Repetir una transición ya realizada no duplica
el descuento. Una reserva entregada no puede cancelarse para recuperar stock.
Conflictos de inventario, UUID o estado devuelven 409.

## Avisos

| Método y ruta | Entrada / operación | Éxito |
|---|---|---|
| GET `/avisos` | Filtros comunes; público solo vigentes publicados | 200 |
| POST `/avisos` | `{categoriaId,titulo,contenido,sectorId,fechaEvento?,venceEn?,estado?}` | 201 |
| GET `/avisos/:id` | Detalle visible | 200 |
| PATCH `/avisos/:id` | Campos editables; solo autor | 200 |

Aviso: `{id,autorId,autor,categoriaId,categoria,titulo,contenido,estado,sectorId,
sectorNombre,fechaEvento,venceEn,creadoEn}`. Fechas ISO UTC o null.
Estados `borrador|publicado|cancelado|vencido`. La interfaz distingue avisos vecinales
de información oficial. Compartir utiliza enlaces/funciones del dispositivo; la API
no envía WhatsApp ni mensajes en nombre de usuarios.
