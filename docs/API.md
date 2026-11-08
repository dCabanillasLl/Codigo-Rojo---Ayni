# API AYNI

Todos los paths de esta guía incluyen `/api`. JSON UTF-8. IDs como cadenas; fechas UTC. Éxito `{ "data": ... }`.
Error `{ "error": { "code": "...", "message": "...", "details": [...] } }`.
`details` es opcional y contiene campos de validación, nunca contraseñas ni SQL.

## Sesión y transporte

Cuando se envía `X-AYNI-User`, también en GET, debe coincidir con la sesión activa.
Una cuenta distinta o una sesión ausente devuelve 409 `SESSION_CHANGED`; el cliente
descarta la caché privada de esa consulta. La cola offline conserva sus pedidos y
verifica nuevamente la identidad antes de enviarlos. El service worker no almacena
respuestas de API: solo los archivos públicos de la aplicación compilada.

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
se requiere teléfono E.164 (`+` y prefijo de país). En registro y edición de perfil,
`telefono` es opcional y debe ser un celular peruano de nueve dígitos que empiece con 9.
La API acepta `987654321`, `51987654321` o `+51987654321` y lo guarda como `+51987654321`.
En perfil, `null` permite quitarlo. El formulario muestra +51 fijo y pide solo los nueve dígitos.
En publicaciones, `telefonoContacto` será
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
o se confirma su recepción. Configura `EMAIL_PROVIDER=gmail`, `GMAIL_USER`,
`GMAIL_APP_PASSWORD` y `EMAIL_FROM` en `backend/.env`; Gmail SMTP no requiere comprar un
dominio. Resend sigue disponible seleccionando `EMAIL_PROVIDER=resend`, con clave API y
dominio remitente verificado. Sin configuración del proveedor se guarda el perfil, pero
no se entrega correo. Consulta [GMAIL_SETUP.md](GMAIL_SETUP.md) para los pasos.

## Catálogos

| Ruta GET | Resultado |
|---|---|
| `/api/health` | `{data:{estado:"ok",baseDeDatos:"conectada"}}`; 503 si no están listos |
| `/api/sectores` | `{data:[{id,nombre,distrito,ciudad}]}` |
| `/api/catalogos` | `{data:{publicaciones:[{id,nombre}],ayuda:[{id,nombre}],avisos:[{id,nombre}]}}` |
| `/api/notificaciones` | Notificaciones privadas del usuario: avisos vecinales y cambios de sus colaboraciones. Las de colaboración incluyen `solicitudId` y `ofertaId`; se consultan periódicamente y se pueden marcar como leídas. Requiere sesión. |

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
| GET `/api/publicaciones/:id/resenas` | Filtro, página, tamaño y orden → recomendaciones con estado de verificación | 200 |

Publicación: `{id,propietarioId,propietario,telefonoContacto,categoriaId,categoria,tipo,titulo,descripcion,
modalidadPrecio,precio,moneda,estado,sectorId,sectorNombre,distanciaMetros,
promedioResenas,totalResenas}`. `telefonoContacto` es null sin consentimiento. Modalidades `gratis|fijo|desde|cotizar`; fijo/desde
requieren precio no negativo con hasta dos decimales, gratis/cotizar requieren precio
nulo/omitido. Estados `borrador|publicada|pausada|archivada`. Por defecto se publica.
Errores específicos: `PRICE_REQUIRED`, `INVALID_PRICE`, `INVALID_SECTOR`.

## Solicitudes de ayuda

| Método y ruta | Entrada / operación | Éxito |
|---|---|---|
| GET `/api/solicitudes` | Filtros comunes; excluye los pedidos propios del listado vecinal. `mios=1` consulta pedidos propios; `participando=1`, colaboraciones del usuario e incluye `miAporteEstado` → `{data: Solicitud[]}` | 200 |
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
| PUT `/api/ofertas/:id/resena` | `{calificacion,comentario?}` → `{data: Resena}`; cualquiera de los dos participantes, tras confirmar la colaboración | 200 |
| GET `/api/usuarios/:id/reputacion` | Sin cuerpo → `{data:{colaboracionesConfirmadas,vistosBuenos,promedio,resenas}}`; cada reseña incluye `solicitudId` y `ofertaId`, y `miCalificacion` para el dueño del perfil | 200 |

Oferta: `{id,solicitudId,voluntarioId,voluntario,mensaje,estado,entregaPendiente,
confirmadaEn,resena,resenaColaborador}`. `resena` es la valoración del solicitante al colaborador;
`resenaColaborador` es la valoración recíproca del colaborador al solicitante. Cada
participante puede crear o editar una reseña por colaboración completada y confirmada;
la base impide reseñas duplicadas del mismo autor para la misma colaboración. En el perfil,
una reseña recibida permite abrir el pedido y calificar al vecino; al calificar, el botón
se reemplaza por la calificación propia y no se crea una respuesta adicional.
La primera puede reconocer la ayuda; la recíproca puede comentar, por ejemplo, la devolución
de un objeto prestado. Las puntuaciones de ambos sentidos participan en el promedio del evaluado.
Cada propuesta genera una notificación privada al solicitante con
el nombre del vecino y el texto de lo que ofrece. La entrega, aceptación, confirmación y
reseña también notifican a la otra persona e incluyen el pedido/aporte relacionado.
Las notificaciones llevan `solicitudId` y `ofertaId` para abrir esa colaboración.
Se conservan ENUM originales:

- `pendiente`: propuesta; solicitante acepta/rechaza y voluntario retira.
- `aceptada`: aporte acordado. Voluntario marca entrega, solicitante confirma recepción.
- `aceptada` + `entregaPendiente:true`: el vecino indicó que entregó, falta confirmar.
- `completada` + `confirmadaEn`: recepción confirmada. Habilita reseña.
- `rechazada`/`retirada`: cancelación, distinguiendo actor.

Varias ofertas pueden aceptarse. Las transiciones se realizan en transacciones con
bloqueo del pedido; entregar/confirmar no completa automáticamente la necesidad.
Una reseña editable por participante de cada colaboración, calificación 1–5. Vistos buenos cuentan
calificaciones 4–5 de colaboraciones confirmadas. Las identidades se derivan de la
solicitud y la oferta; el cliente no elige al autor ni al evaluado. La migración `014` conserva
las reseñas actuales como valoraciones del solicitante y agrega autor/evaluado para las nuevas.
Pedidos, propuestas y comentarios aplican las restricciones de AYNI y bloquean sustancias,
dinero, contenido sexual, insultos y lenguaje discriminatorio tanto en el cliente como en API.
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
| POST `/api/avisos` | `{categoriaId,titulo,contenido,sectorId,fechaEvento,ubicacion,foto?,imagenUrl?,venceEn?,estado?}` → `{data: Aviso}` | 201 |
| GET `/api/avisos/:id` | Sin cuerpo → `{data: Aviso}` visible | 200 |
| PATCH `/api/avisos/:id` | Campos editables → `{data: Aviso}` actualizado; solo autor | 200 |
| GET `/api/avisos/:id/imagen?v=hash` | JPEG del flyer cargado, sujeto a visibilidad y vigencia | 200 |

Aviso: `{id,autorId,autor,categoriaId,categoria,titulo,contenido,imagenUrl,estado,sectorId,
sectorNombre,distanciaMetros,fechaEvento,venceEn,creadoEn}`. `imagenUrl` en la respuesta
puede ser una ruta `/api/avisos/:id/imagen?v=hash` o un enlace HTTPS anterior.
`foto` recibe un data URI JPG, PNG o WebP de hasta 5 MB; se normaliza y almacena en
MySQL mediante la migración 007. Omitirla al editar conserva la imagen; `null` la
quita; una nueva reemplaza el flyer. También se conserva `imagenUrl` HTTPS como
entrada compatible; no se pueden modificar archivo y enlace al mismo tiempo.
POST/PATCH admiten JSON de hasta 8 MB después de autenticar, igual que publicaciones.

`fechaEvento` es obligatoria y futura al crear (ISO con zona horaria); `venceEn` es
opcional y, si se proporciona, también debe ser futuro. Se guardan como UTC. La
primera de ambas fechas determina la retirada pública, incluso si el cliente consulta
directamente el detalle o la imagen. Listados y detalle devuelven `Cache-Control:
no-store`. El autor puede consultar el registro vencido y su imagen; los demás reciben
404. El estado efectivo devuelto es `vencido`, sin borrar el registro ni requerir cron.
Editar no permite quitar todas las fechas. Los avisos antiguos sin fechas se conservan.
La interfaz filtra además avisos vencidos en su caché y al permanecer abierta.

`ubicacion:{latitud,longitud,direccion?}` es obligatoria para crear un aviso nuevo.
Ambas coordenadas deben ser numéricas, finitas y estar dentro de los límites
geográficos; `direccion` admite hasta 255 caracteres. El servidor crea un lugar
independiente y lo marca como público con la migración 010. No hereda ni modifica la
dirección del perfil. Si falta el punto devuelve 400 `EVENT_LOCATION_REQUIRED`.

Los avisos devuelven `direccionActividad`, `latitudActividad` y `longitudActividad`:
son el lugar exacto elegido explícitamente para la actividad, visible en su tarjeta,
mapa y enlace a Google Maps. Los tres son null en avisos anteriores cuya ubicación
podría proceder del perfil privado. Se mantienen las restricciones de visibilidad
del aviso: la ubicación no hace públicos los avisos cancelados o vencidos.

PATCH admite `ubicacion` para cambiar el punto solo por el autor; cada cambio crea
una ubicación nueva y notifica a los asistentes confirmados. Omitirla conserva el
lugar anterior, incluso si se reenvía el mismo `sectorId`. Cambiar el sector interno
exige un punto explícito para evitar heredar por error una ubicación de perfil.
`ultimoCambioEvento:"ubicacion"` representa este cambio y se presenta como ACTUALIZADO.

La interfaz de edición está disponible solo para el autor y envía únicamente los campos
modificados. PATCH admite además `revisionEvento?:number` para comprobar la revisión
que el usuario abrió: si no coincide, devuelve 409 `EVENT_CHANGED` sin guardar. Todas
las ediciones incrementan la revisión, incluso texto o flyer; solo cambios de fecha,
estado o ubicación generan notificaciones. Reenviar únicamente la revisión no es una
edición válida. Omitir fecha, foto o ubicación los conserva sin modificar. Esto permite
corregir el texto de actividades vencidas sin reactivarlas ni exigir una fecha nueva.
Las actividades canceladas no admiten PATCH, ni siquiera del autor: devuelve 409
`EVENT_CANCELLED`. No se permite modificar su lugar, texto, flyer o reactivarlas por
edición. La interfaz oculta el acceso al editor y mantiene la eliminación permanente.

`DELETE /api/avisos/:id` requiere sesión del autor y JSON
`{confirmar:true,revisionEvento:number}`. Solo permite borrar registros en estado
`cancelado`; en otro estado devuelve 409 `EVENT_NOT_CANCELLED`. Una revisión antigua
devuelve 409 `EVENT_CHANGED`; otro usuario recibe 403. Devuelve
`{data:{eliminado:true}}` y admite reintentos si el registro ya no existe.
La protección de origen, cabecera propia y comprobación de `X-AYNI-User` también
se aplican a DELETE; CORS incluye ese método.

La eliminación es transaccional: borra la fila del aviso, el flyer y sus asistencias
por cascada. Borra el lugar público solo si ningún perfil, producto, servicio, pedido,
aviso o recurso lo referencia. No elimina ubicaciones privadas heredadas. La migración
011 cambia la referencia de notificaciones a `ON DELETE SET NULL`: se conserva su
texto y lectura pendiente, con `avisoId:null`, sin enlace a una actividad inexistente.
La interfaz oculta compartir por WhatsApp para cancelados y solo ofrece la eliminación
al organizador, con confirmación explícita previa.
Estados `borrador|publicado|cancelado|vencido`. La interfaz distingue avisos vecinales
de información oficial. Compartir utiliza enlaces/funciones del dispositivo; la API
no envía WhatsApp ni mensajes en nombre de usuarios.

### Asistencia y cambios de actividades

Los avisos incluyen `totalAsistentes`, `miAsistencia`, `revisionEvento` y `motivoCambio`.
`ultimoCambioEvento` distingue `postergado`, `reprogramado`, `cancelado` y `retirado`
(nullable para registros anteriores; migración 009). Permite mostrar etiquetas de
estado sin confundir una actualización de vencimiento con una postergación. El estado
de publicación permanece `publicado` tras postergar; cancelación y vencimiento tienen
prioridad sobre la etiqueta del último cambio.
El total cuenta confirmaciones de cuentas activas; no se exponen listas de nombres.
`GET /api/avisos?asistire=1` requiere sesión y devuelve las actividades confirmadas,
incluidas canceladas o vencidas. Es incompatible con `mios=1`. El organizador y los
asistentes confirmados también pueden consultar su detalle e imagen tras la retirada;
el resto recibe 404.

| Método y ruta | Entrada / operación | Éxito |
|---|---|---|
| PUT `/api/avisos/:id/asistencia` | `{asistire:boolean}`; confirma o retira la propia asistencia, sin duplicados | 200 |
| POST `/api/avisos/:id/cambios` | `{accion:"postergar",fechaEvento,motivo,revisionEvento}` o `{accion:"cancelar",motivo,revisionEvento}`; solo organizador | 200 |
| GET `/api/notificaciones` | Últimas 100 notificaciones privadas de la propia cuenta: `{data:[{id,text,createdAt,read,avisoId,solicitudId,ofertaId,tipo}]}` | 200 |
| POST `/api/notificaciones/leidas` | `{ids:string[]}` de hasta 100 UUID; marca solo notificaciones de la propia cuenta | 200 |

No se permite confirmar la propia actividad ni una actividad cancelada, retirada o
vencida. Retirar una confirmación sigue siendo posible tras el vencimiento o cancelación.
Postergar exige fecha futura posterior a la anterior; conserva confirmaciones y limpia
el `venceEn` anterior. Cancelar retira el aviso público. El motivo admite 3–500 caracteres.
Una revisión desactualizada devuelve 409 `EVENT_CHANGED`; una actividad retirada devuelve
409 `EVENT_NOT_AVAILABLE`. Reintentar el mismo cambio ya aplicado no duplica notificaciones.

Las confirmaciones y los cambios bloquean la fila del aviso para serializar operaciones
concurrentes. El cambio y las notificaciones a asistentes confirmados activos se guardan
en la misma transacción. La edición directa por PATCH también notifica cambios de fechas
o retirada del evento. Migración requerida: 008. No hay envío a servicios externos.
Las notificaciones usan `Cache-Control: no-store`, comprobación de `X-AYNI-User` y caché
local por cuenta. El cliente consulta cada 20 segundos mientras está visible y al volver
a la app; permite recuperar notificaciones guardadas durante una desconexión. Migración
requerida para notificaciones de colaboraciones y reseñas: `013_notificaciones_interacciones.sql`.

### Guía Gemini

El endpoint de la guía solo recibe el historial reciente del chat. No guarda prompts ni
respuestas. El backend los envía a Gemini; la interfaz advierte no escribir DNI,
contraseñas ni direcciones. La clave solo se configura en `backend/.env` mediante
`GEMINI_API_KEY`; `GEMINI_MODEL` es opcional y por defecto `gemini-3.8-flash`.
La guía no puede consultar datos de usuarios ni modificar pedidos.

| Método y ruta | Entrada / operación | Éxito |
|---|---|---|
| POST `/api/assistant/chat` | `{messages:[{role:"user"|"model",text:string}]}`; máximo 8 turnos, 600 caracteres por turno; limitado a 12 solicitudes/minuto/cliente | 200 `{data:{answer:string}}` |

Errores: 400 `VALIDATION_ERROR`/`USER_MESSAGE_REQUIRED`, 429 `AI_RATE_LIMITED` o
`GEMINI_RATE_LIMITED`, 502 `GEMINI_REQUEST_FAILED`/`GEMINI_EMPTY_RESPONSE`, 503
`GEMINI_NOT_CONFIGURED`/`GEMINI_AUTH_FAILED`/`GEMINI_UNAVAILABLE`. Sin clave o si
Gemini no responde, la interfaz conserva sus acciones rápidas y muestra una respuesta
de contingencia.

### Identidad y pertenencia a zona

`POST /api/identity/dni/lookup` consulta API Perú para prellenar nombres y emite una
prueba firmada de corta duración para el registro. Esa consulta **no acredita la
titularidad del DNI**; la cuenta nueva queda `PENDIENTE` hasta revisión manual. GPS y la
zona declarada tampoco acreditan residencia. El backend no devuelve el hash del DNI,
domicilio ni coordenadas en estas rutas.

| Método y ruta | Entrada / operación | Éxito |
|---|---|---|
| GET `/api/identity/me` | Estado de identidad de la cuenta autenticada: estado, método y fechas | 200 |
| POST `/api/identity/verification-request` | `{}`; solicita revisión manual o reabre un rechazo/revocación | 200 |
| GET `/api/identity/zones` | Membresías propias, zona aproximada, estado, fechas y vigencia | 200 |
| POST `/api/identity/zones` | `{sectorId:string}`; crea/reabre una solicitud sin adjuntar domicilio ni GPS | 202 |
| GET `/api/admin/verifications?tipo=identidad\|zona` | Cola pendiente limitada a 100 entradas; solo revisor configurado | 200 |
| PATCH `/api/admin/verifications/identity/:userId` | `{accion:"aprobar"\|"rechazar"\|"revocar",metodo,motivo?}` | 200 |
| PATCH `/api/admin/verifications/zones/:id` | Mismo cuerpo; aprobar puede incluir `venceEn` ISO-8601 | 200 |

Los métodos admitidos son `REVISION_PRESENCIAL`, `REFERENCIA_VECINAL`,
`VALIDACION_INSTITUCIONAL` y `OTRO`. Rechazar o revocar requiere un motivo; el motivo
no puede contener una cadena de ocho dígitos. Aprobar/rechazar solo acepta solicitudes
pendientes; revocar solo verificaciones vigentes. Nadie puede revisar su propia cuenta.
Las acciones y actor se guardan en `auditoria_verificaciones` dentro de la misma
transacción.

No existe un rol administrativo persistido en el esquema: las cuentas autorizadas se
configuran exclusivamente en el servidor con `AYNI_REVIEWER_USER_IDS=12,34` (IDs internos
de usuarios). Vacío significa que nadie puede revisar. Nunca se acepta un rol enviado
por el navegador. El equipo debe contrastar la identidad/residencia fuera de AYNI; no se
suben ni almacenan documentos de prueba.

### Interacciones verificables con productos y servicios

Las interacciones pertenecen a publicaciones de producto o servicio y se mantienen
separadas de solicitudes de ayuda, colaboraciones y reservas de recursos. Solo los dos
participantes pueden consultar el detalle. La respuesta no incluye correo, teléfono,
DNI, dirección ni coordenadas.

| Método y ruta | Entrada / operación | Éxito |
|---|---|---|
| POST `/api/publicaciones/:id/interacciones` | `{tipo:"CONSULTA"|"COMPRA"|"CONTRATACION"|"OTRO"}`; el dueño se obtiene de la publicación | 201; 200 devuelve la interacción activa previa |
| GET `/api/interacciones` | Interacciones propias; opcional `?publicacionId=:id`; cada una incluye `resenaCreada` | 200 |
| GET `/api/interacciones/:id` | Detalle visible solo a los participantes | 200 |
| PATCH `/api/interacciones/:id` | `{accion:"aceptar"|"rechazar"|"iniciar"|"cumplir"|"confirmar"|"cancelar"}` | 200 |

El proveedor acepta o rechaza una propuesta pendiente, inicia una interacción aceptada
y marca el cumplimiento cuando está en curso. Quien inició la interacción confirma la
recepción después del cumplimiento. Solo esa segunda confirmación deja el estado
`CONFIRMADA`; repetir una acción ya registrada es idempotente. Cualquiera de los
participantes puede cancelar antes de la confirmación final. Un tercero recibe 404 para
no revelar si existe la interacción; una acción de participante con transición inválida
recibe 409. Otros errores posibles: 400 `VALIDATION_ERROR`, 401 `UNAUTHENTICATED`,
404 `PUBLICATION_NOT_AVAILABLE`/`INTERACTION_NOT_FOUND`, 409 `SELF_INTERACTION`,
`INVALID_TRANSITION`/`FULFILLMENT_REQUIRED`, 503 `DATABASE_SCHEMA_REQUIRED`.

Para la Fase 5, `getConfirmedPublicationInteraction` en
`backend/src/services/publication-interactions.ts` proporciona una consulta reutilizable
que exige coincidencia de interacción, publicación y solicitante, y ambas confirmaciones.
La siguiente sección describe la API de recomendaciones implementada en Fase 5.

### Recomendaciones de productos y servicios

Las reseñas del muro de ayuda (`resenas_colaboracion`) permanecen independientes. Esta
API trabaja con `resenas` vinculadas a publicaciones. `NO_VERIFICADA` significa que no se
aportó una interacción; `PENDIENTE` significa que se vinculó una interacción válida pero
aún falta confirmarla o acreditar identidad/zona; `VERIFICADA` se calcula al consultar y
solo aparece mientras coinciden todas las evidencias vigentes. Las reseñas históricas sin
interacción siguen como `NO_VERIFICADA`.

| Método y ruta | Entrada / operación | Éxito |
|---|---|---|
| POST `/api/publicaciones/:id/resenas` | `{calificacion:1..5, comentario?:string, interaccionId?:string}`; autor desde sesión | 201 |
| GET `/api/publicaciones/:id/resenas` | `?filtro=todas\|verificadas\|no_verificadas\|pendientes&pagina=1&porPagina=20&orden=recientes\|antiguas` | 200 `{data:[],paginacion:{pagina,porPagina,total,totalPaginas}}` |
| GET `/api/publicaciones/:id/resenas/resumen` | Conteos, promedios separados y `miOpinion` para la sesión actual | 200 |

El POST no acepta autor, proveedor, identidad, zona ni estado de verificación desde el
cliente. Una opinión sin `interaccionId` queda `NO_VERIFICADA`; una experiencia activa o
confirmada que todavía no satisface identidad/zona queda `PENDIENTE`. La interacción debe
pertenecer al autor, a esta publicación y al proveedor que consta en ella; una interacción
rechazada o cancelada no puede respaldar una opinión. El autor no puede reseñar su propia
publicación y solo se admite una opinión por autor y publicación.

Errores principales: 400 `VALIDATION_ERROR`/`COMMUNITY_CONTENT_RESTRICTED`, 401
`UNAUTHENTICATED`, 404 `PUBLICATION_NOT_FOUND`, 409 `SELF_REVIEW_FORBIDDEN`,
`REVIEW_ALREADY_EXISTS`, `INTERACTION_MISMATCH`/`INTERACTION_INVALID`, 503
`DATABASE_SCHEMA_REQUIRED`. La lista expone solo el nombre público abreviado, calificación,
comentario y fechas; nunca DNI, teléfono, correo, domicilio, coordenadas ni documentos.

El resumen separa `verificadas`, `noVerificadas` y `pendientes`; el promedio principal
`promedioVerificado` usa solo opiniones verificadas. `promedioGeneral` se devuelve aparte.
La revocación de identidad, revocación/vencimiento de la zona o cancelación de evidencia
retira el sello en las siguientes consultas, sin borrar la opinión ni confiar en el valor
persistido de `estado_verificacion`.

La API exige identidad vigente y pertenencia de zona verificada y no vencida del autor,
en el sector de la publicación. La experiencia vinculada demuestra que el proveedor es
el propietario y que el autor confirmó la recepción; el sello se recalcula en cada lectura.
