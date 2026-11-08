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
| POST `/api/auth/register` | `{nombres,apellidos,dni,consentimientoDni:true,dniProof,contrasena,direccion?,latitud?,longitud?,telefono?}` → `{data: Usuario}` y cookie HttpOnly | 201 |
| POST `/api/auth/login` | `{identificador: DNI,contrasena}` (la API mantiene compatibilidad con correo para clientes antiguos) → `{data: Usuario}` y cookie HttpOnly | 200 |
| POST `/api/identity/dni/lookup` | `{dni,consentimiento:true}` → `{data:{nombres,apellidos,proof,venceEnSegundos}}`; devuelve solo nombres y apellidos, no dirección ni ubigeos. Máximo 8 consultas/15 min/IP. | 200 |
| GET `/api/auth/me` | Sin cuerpo → `{data: Usuario}` de la sesión | 200 |
| PATCH `/api/auth/me` | `{correo?,notificacionesCorreo?,telefono?,telefonoPublico?,sectorId?,direccion?,latitud?,longitud?}` → `{data: Usuario}` actualizado | 200 |
| POST `/api/auth/logout` | `{}` → `{data:{cerrado:true}}`, elimina cookie | 200 |

Usuario: `{id,nombres,apellidos,correo|null,telefono,telefonoPublico,sectorId,sectorNombre,direccion,latitud,longitud}`. Dirección y coordenadas solo se devuelven en las respuestas autenticadas de la propia cuenta; nunca se incluyen en listados o fichas vecinales. Correo y teléfono
solo se devuelven al propio usuario. `telefonoPublico` es consentimiento opcional; para activarlo
se requiere teléfono E.164 (`+` y prefijo de país). En publicaciones, `telefonoContacto` será
`null` por defecto; solo devuelve el número con consentimiento. El registro se hace con DNI validado;
el correo es opcional y el acceso se realiza con DNI. Se asigna internamente la zona general Pueblo Libre.
El registro valida contraseña y límites de texto; teléfonos únicos. Dirección requerida y guardada en la
columna privada de ubicación. Coordenadas opcionales, siempre juntas; sirven para aproximar distancias y nunca se
devuelven al público. Errores: `INVALID_CREDENTIALS`, `INVALID_SECTOR`, `DUPLICATE`,
`AUTH_NOT_CONFIGURED`, `VALIDATION_ERROR`. No hay recuperación de contraseña por correo.
La consulta DNI requiere `APIPERU_API_KEY`, `JWT_SECRET` y `DNI_HASH_SECRET` en el backend.
El backend consulta la API DNI/RUC de API Perú mediante `GET https://dniruc.apisperu.com/api/v1/dni/{dni}` y `Authorization: Bearer ...`.
El consentimiento del cuerpo es obligatorio para llamar a API Perú. El registro requiere
DNI y el comprobante temporal devuelto por la consulta; el servidor guarda solo HMAC-SHA256
del DNI, nunca el DNI original. Aplicar `004_dni_hash.sql` y `005_registro_dni_sin_correo.sql`
antes de habilitar registro/acceso por DNI sin correo ni selector de zona. La sugerencia de
dirección desde GPS usa BigDataCloud client-side; devuelve localidad aproximada editable.
Errores adicionales: `DNI_LOOKUP_NOT_CONFIGURED`,
`DNI_PROVIDER_UNAVAILABLE`, `DNI_PROVIDER_AUTH_FAILED`, `DNI_NOT_FOUND`,
`DNI_PROOF_INVALID`, `INVALID_DNI`.

Nombres y apellidos se fijan con la consulta verificada del DNI y no se pueden modificar
desde el perfil ni desde PATCH `/auth/me`. El correo es opcional y único. La preferencia
`notificacionesCorreo` se activa explícitamente y requiere un correo válido. AYNI envía
avisos cuando alguien ofrece ayuda, una propuesta cambia de estado, se marca una entrega
o se confirma su recepción. Se necesita `RESEND_API_KEY`, un remitente verificado en
Resend (`EMAIL_FROM`) y aplicar `008_notificaciones_correo.sql`; sin configuración del
proveedor se guarda el perfil, pero no se entrega correo.

## Catálogos

| Ruta GET | Resultado |
|---|---|
| `/api/health` | `{data:{estado:"ok",baseDeDatos:"conectada"}}`; 503 si no están listos |
| `/api/sectores` | `{data:[{id,nombre,distrito,ciudad}]}` |
| `/api/catalogos` | `{data:{publicaciones:[{id,nombre}],ayuda:[{id,nombre}],avisos:[{id,nombre}]}}` |

## Listados y cercanía

Los productos/servicios y pedidos de ayuda incluyen `mapaLatitud` y `mapaLongitud`,
ambas nulas sin coordenadas. Son coordenadas aproximadas redondeadas a tres decimales;
no representan una dirección exacta. Los endpoints de creación de publicaciones y
solicitudes, y la edición de publicaciones, aceptan un campo opcional:

```json
{"ubicacion":{"latitud":-12.074321,"longitud":-77.063219,"direccion":"Referencia privada opcional"}}
```

Las dos coordenadas son obligatorias dentro de `ubicacion`, numéricas, finitas y
dentro de los límites geográficos. El punto crea una ubicación independiente del
perfil; `direccion` nunca se devuelve en estos endpoints. Si se omite `ubicacion`,
al crear se usa el punto del perfil solo si coincide la comunidad elegida. Al editar
en la misma comunidad sin `ubicacion` se conserva el punto anterior.
La ubicación explícita también forma parte de la huella de idempotencia del pedido.

`GET /api/ubicaciones/sugerencias?q=...&latitud=...&longitud=...` ofrece hasta cinco
direcciones de Perú mediante Photon como `{id,nombre,latitud,longitud}`. `q` tiene
entre 3 y 200 caracteres; las coordenadas de preferencia son opcionales y deben
enviarse juntas. El cliente espera 650 ms después de escribir y cancela solicitudes
anteriores para evitar respuestas desactualizadas.

`GET /api/ubicaciones/reversa?latitud=...&longitud=...` consulta una dirección cercana
al punto y devuelve `{data:{direccion:string|null}}`. Las coordenadas son obligatorias,
numéricas, finitas y dentro de sus límites geográficos. No reemplaza el punto elegido;
la dirección es aproximada y editable. `null` permite escribir una referencia manual.

Ambas rutas envían `Cache-Control: no-store` y comparten un límite de 60 consultas/minuto
por cliente. El servidor usa caché interna de diez minutos, agrupa solicitudes iguales
y consulta como máximo una vez por segundo por proceso. Devuelven 429
`PLACE_LOOKUP_BUSY` si la cola está ocupada y 503 `PLACE_LOOKUP_UNAVAILABLE` si falla
el proveedor. `PLACES_API_URL` configura la instancia Photon. No consultan datos de vecinos.

`GET /api/ubicaciones/buscar?q=...` conserva la búsqueda explícita anterior de Perú.
`q` tiene entre 3 y 200 caracteres. Devuelve hasta cinco
`{id,nombre,latitud,longitud}` del proveedor de geocodificación, no de otros usuarios.
Tiene límite de 15 consultas/minuto por cliente, caché en memoria y un límite de
una consulta al proveedor cada 1.1 segundos por proceso. Si está ocupado devuelve
429 `GEOCODING_BUSY`; si falla el proveedor, 503 `GEOCODING_UNAVAILABLE`.
La selección manual del mapa y el GPS siguen disponibles ante un fallo de búsqueda.

Los listados devuelven arrays, máximo 100 registros. Filtros comunes: `q`, `sectorId`,
`categoriaId`, `mios=1`, `latitud`, `longitud`, `radio` (1000–2000 metros, por defecto
1000). Coordenadas siempre juntas; bounding box y distancia geográfica se calculan
en servidor. `distanciaMetros` se redondea a 50 m y es null cuando no se conoce.
Los filtros de sector y radio se combinan si se proporcionan ambos.
La interfaz no muestra selectores de comunidad o sector ni envía `sectorId` en las
búsquedas. Usa coordenadas y radio, o consulta sin filtro geográfico cuando no hay
un punto elegido. Los campos de sector se conservan por compatibilidad con los datos
existentes: al crear se usa la asociación del perfil o la zona base configurada y al
editar una publicación se mantiene su asociación anterior.
`mios=1` exige sesión y permite consultar estados no publicados propios.

## Publicaciones

La creación y edición aceptan `foto` opcional: una data URI
`data:image/jpeg;base64,...`, `data:image/png;base64,...` o `data:image/webp;base64,...`.
El archivo original tiene un máximo de 5 MB y 25 millones de píxeles; no se admiten
SVG ni animaciones. El servidor verifica su contenido, aplica orientación, reduce a
1600 px como máximo, elimina metadatos y guarda JPEG de hasta 2 MB en MySQL.
La foto y los datos de la publicación se guardan juntos, sin archivos huérfanos.

- Omitir `foto` al crear permite publicar sin imagen; omitirla al editar conserva la actual.
- `foto:null` elimina la foto al guardar.
- Una data URI válida añade o reemplaza la foto; solo puede hacerlo el propietario.
- Las respuestas incluyen `imagenUrl:string|null`, una ruta de API con versión por hash,
  y nunca incluyen el BLOB o la data URI. El cliente debe resolverla con su base de API.
- `GET /api/publicaciones/:id/imagen?v=<hash>` entrega `image/jpeg` o 304 si la versión
  coincide con `If-None-Match`. Sin foto, con una versión antigua o sin permiso devuelve 404.
  Una imagen de publicación pausada/borrador/archivada solo se devuelve a su propietario.
  La caché es privada y requiere revalidación para respetar cambios de visibilidad.

POST/PATCH de publicaciones admiten JSON de hasta 8 MB después de autenticar, manteniendo
las comprobaciones de origen y cabecera. El resto de rutas admite 64 KB.
Errores específicos: 400 `INVALID_PHOTO`, `PHOTO_DIMENSIONS_TOO_LARGE`,
`ANIMATED_PHOTO_NOT_SUPPORTED`; 413 `PHOTO_TOO_LARGE` o `BODY_TOO_LARGE`.

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
| GET `/api/solicitudes` | Filtros comunes; excluye los pedidos propios del listado vecinal. `mios=1` consulta pedidos propios; `participando=1`, colaboraciones del usuario → `{data: Solicitud[]}` | 200 |
| POST `/api/solicitudes` | `{clientRequestId,categoriaId,sectorId,descripcion,titulo?,urgencia?}` → `{data: Solicitud}` | 201 o 200 si reintento |
| GET `/api/solicitudes/:id` | Sin cuerpo → `{data: Solicitud}` | 200 |
| PATCH `/api/solicitudes/:id` | `{accion:'completar'}` o `{accion:'cancelar',motivo}` → `{data: Solicitud}`; solo solicitante | 200 |

Solicitud: `{id,solicitanteId,solicitante,categoriaId,categoria,sectorId,sectorNombre,
titulo,descripcion,urgencia,estado,creadoEn,venceEn,distanciaMetros,clientRequestId}`.
Urgencia `normal|urgente`; estados `abierta|en_curso|completada|cancelada|vencida`.
La creación guarda UUID + huella del contenido: mismo usuario/UUID/contenido devuelve
el original; distinto contenido produce 409. No se debe generar otro UUID al reintentar.
Completar requiere resolver aportes aceptados pendientes de recepción; las propuestas
pendientes se rechazan al cerrar. Cancelar requiere motivo.

La vigencia se asigna automáticamente por categoría: apoyo urgente 24 horas, un favor
3 días, y préstamos, donaciones e intercambios 7 días. Al vencer, un pedido abierto pasa
a `vencida`, deja de aparecer en el mapa vecinal y sus propuestas pendientes se rechazan;
el dueño puede consultar y cerrar su pedido desde `mios=1`. Si ya estaba `en_curso`, deja
de aceptar nuevas ofertas y sale del listado público al vencer, pero las personas que ya
acordaron la ayuda pueden terminarla y el dueño puede confirmar el resultado.

El servidor genera el título a partir de la descripción. La categoría “Apoyo urgente” asigna
la urgencia automáticamente. Se rechazan solicitudes que mencionen drogas, alcohol, dinero
o contenido sexual, tanto en la app como en el servidor; el servidor es la validación final.

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
