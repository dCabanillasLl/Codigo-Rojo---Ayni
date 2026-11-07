# API AYNI

Todos los paths de esta guía incluyen `/api`. JSON UTF-8. IDs como cadenas; fechas UTC. Éxito `{ "data": ... }`.
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
| POST `/api/auth/register` | `{nombres,apellidos,correo,contrasena,sectorId,telefono?,latitud?,longitud?}` → `{data: Usuario}` y cookie HttpOnly | 201 |
| POST `/api/auth/login` | `{identificador,contrasena}` (correo o DNI) o formato antiguo `{correo,contrasena}` → `{data: Usuario}` y cookie HttpOnly | 200 |
| POST `/api/identity/dni/lookup` | `{dni,consentimiento:true}` → `{data:{nombres,apellidos,proof,venceEnSegundos}}`; devuelve solo nombres y apellidos, no dirección ni ubigeos. Máximo 8 consultas/15 min/IP. | 200 |
| GET `/api/auth/me` | Sin cuerpo → `{data: Usuario}` de la sesión | 200 |
| PATCH `/api/auth/me` | `{nombres?,apellidos?,telefono?,telefonoPublico?,sectorId?,latitud?,longitud?}` → `{data: Usuario}` actualizado | 200 |
| POST `/api/auth/logout` | `{}` → `{data:{cerrado:true}}`, elimina cookie | 200 |

Usuario: `{id,nombres,apellidos,correo,telefono,telefonoPublico,sectorId,sectorNombre}`. Correo y teléfono
solo se devuelven al propio usuario. `telefonoPublico` es consentimiento opcional; para activarlo
se requiere teléfono E.164 (`+` y prefijo de país). En publicaciones, `telefonoContacto` será
`null` por defecto; solo devuelve el número con consentimiento. El registro valida contraseña y límites de texto;
correo/teléfono únicos. Coordenadas opcionales, siempre juntas y con sector; nunca se
devuelven al público. Errores: `INVALID_CREDENTIALS`, `INVALID_SECTOR`, `DUPLICATE`,
`AUTH_NOT_CONFIGURED`, `VALIDATION_ERROR`. No hay recuperación de contraseña por correo.
La consulta DNI requiere `APIPERU_API_KEY`, `JWT_SECRET` y `DNI_HASH_SECRET` en el backend.
El backend consulta la API DNI/RUC de API Perú mediante `GET https://dniruc.apisperu.com/api/v1/dni/{dni}` y `Authorization: Bearer ...`.
El consentimiento del cuerpo es obligatorio para llamar a API Perú. Si se adjunta DNI al
registro, también se requiere el comprobante temporal devuelto por la consulta; el servidor
guarda solo HMAC-SHA256 del DNI, nunca el DNI original. Aplicar `004_dni_hash.sql` antes
de habilitar registro/acceso por DNI. Errores adicionales: `DNI_LOOKUP_NOT_CONFIGURED`,
`DNI_PROVIDER_UNAVAILABLE`, `DNI_PROVIDER_AUTH_FAILED`, `DNI_NOT_FOUND`,
`DNI_PROOF_INVALID`, `INVALID_DNI`.

## Catálogos

| Ruta GET | Resultado |
|---|---|
| `/api/health` | `{data:{estado:"ok",baseDeDatos:"conectada"}}`; 503 si no están listos |
| `/api/sectores` | `{data:[{id,nombre,distrito,ciudad}]}` |
| `/api/catalogos` | `{data:{publicaciones:[{id,nombre}],ayuda:[{id,nombre}],avisos:[{id,nombre}]}}` |

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
| GET `/api/publicaciones` | Filtros comunes y `tipo=producto|servicio` → `{data: Publicacion[]}`; incluye `telefonoContacto` solo con consentimiento del vecino | 200 |
| POST `/api/publicaciones` | `{categoriaId,tipo,titulo,descripcion?,modalidadPrecio,precio?,sectorId,estado?}` → `{data: Publicacion}` | 201 |
| GET `/api/publicaciones/:id` | Sin cuerpo → `{data: Publicacion}` pública publicada o propia | 200 |
| PATCH `/api/publicaciones/:id` | Campos editables de creación, al menos uno → `{data: Publicacion}` actualizada; solo propietario | 200 |
| GET `/api/publicaciones/:id/resenas` | Sin cuerpo → `{data: Resena[]}`; `verificada:false` | 200 |

Publicación: `{id,propietarioId,propietario,telefonoContacto,categoriaId,categoria,tipo,titulo,descripcion,
modalidadPrecio,precio,moneda,estado,sectorId,sectorNombre,distanciaMetros,
promedioResenas,totalResenas}`. `telefonoContacto` es null sin consentimiento. Modalidades `gratis|fijo|desde|cotizar`; fijo/desde
requieren precio no negativo con hasta dos decimales, gratis/cotizar requieren precio
nulo/omitido. Estados `borrador|publicada|pausada|archivada`. Por defecto se publica.
Errores específicos: `PRICE_REQUIRED`, `INVALID_PRICE`, `INVALID_SECTOR`.

## Solicitudes de ayuda

| Método y ruta | Entrada / operación | Éxito |
|---|---|---|
| GET `/api/solicitudes` | Filtros comunes; `participando=1` para colaboraciones del usuario → `{data: Solicitud[]}` | 200 |
| POST `/api/solicitudes` | `{clientRequestId,categoriaId,sectorId,titulo,descripcion,urgencia}` → `{data: Solicitud}` | 201 o 200 si reintento |
| GET `/api/solicitudes/:id` | Sin cuerpo → `{data: Solicitud}` | 200 |
| PATCH `/api/solicitudes/:id` | `{accion:'completar'}` o `{accion:'cancelar',motivo}` → `{data: Solicitud}`; solo solicitante | 200 |

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
| GET `/api/solicitudes/:id/ofertas` | Sin cuerpo → `{data: Oferta[]}`; solicitante ve todas y voluntario las propias | 200 |
| POST `/api/solicitudes/:id/ofertas` | `{mensaje}` → `{data: Oferta}`; no ofrecerse a uno mismo | 201 o 200 si ya existe la misma propuesta |
| PATCH `/api/ofertas/:id` | `{accion:'aceptar'|'rechazar'|'retirar'|'entregar'|'confirmar'}` → `{data: Oferta}` | 200 |
| PUT `/api/ofertas/:id/resena` | `{calificacion,comentario?}` → `{data: Resena}`; solicitante tras confirmar recepción | 200 |
| GET `/api/usuarios/:id/reputacion` | Sin cuerpo → `{data:{colaboracionesConfirmadas,vistosBuenos,promedio,resenas}}` | 200 |

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
| GET `/api/recursos` | Filtros comunes → `{data: Recurso[]}` | 200 |
| POST `/api/recursos` | `{titulo,unidad,cantidadTotal,sectorId}` → `{data: Recurso}` | 201 |
| GET `/api/recursos/:id` | Sin cuerpo → `{data: Recurso}` | 200 |
| GET `/api/recursos/:id/reservas` | Sin cuerpo → `{data: Reserva[]}`; dueño ve todas y solicitante las propias | 200 |
| POST `/api/recursos/:id/reservas` | `{clientRequestId,cantidad,solicitudId?}` → `{data: Reserva}` | 201 o 200 si reintento |
| PATCH `/api/reservas/:id` | `{accion:'confirmar'|'entregar'|'cancelar'}` → `{data: Reserva}` | 200 |

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
| GET `/api/avisos` | Filtros comunes; público solo vigentes publicados → `{data: Aviso[]}` | 200 |
| POST `/api/avisos` | `{categoriaId,titulo,contenido,sectorId,imagenUrl?,fechaEvento?,venceEn?,estado?}` → `{data: Aviso}` | 201 |
| GET `/api/avisos/:id` | Sin cuerpo → `{data: Aviso}` visible | 200 |
| PATCH `/api/avisos/:id` | Campos editables → `{data: Aviso}` actualizado; solo autor | 200 |

Aviso: `{id,autorId,autor,categoriaId,categoria,titulo,contenido,imagenUrl,estado,sectorId,
sectorNombre,distanciaMetros,fechaEvento,venceEn,creadoEn}`. `imagenUrl` debe ser una URL HTTPS pública;
se almacena la referencia, no se carga el archivo. Fechas ISO UTC o null.
Estados `borrador|publicado|cancelado|vencido`. La interfaz distingue avisos vecinales
de información oficial. Compartir utiliza enlaces/funciones del dispositivo; la API
no envía WhatsApp ni mensajes en nombre de usuarios.
