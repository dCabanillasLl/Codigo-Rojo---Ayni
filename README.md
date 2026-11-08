# AYNI · Tu barrio responde

Aplicación comunitaria para encontrar productos y servicios, pedir ayuda, coordinar
varios aportes y compartir recursos. Se conserva el frontend React/Vite existente.
La API usa Express, TypeScript y MySQL 8; el navegador nunca accede directamente a MySQL.

## Preparar el proyecto

Requisitos: Node.js 22.12 o superior y una base MySQL 8.0.16 o superior.
Se usa **npm** para frontend y backend. `package-lock.json` fija las versiones;
el `pnpm-lock.yaml` original se conserva como antecedente, no como ruta de instalación.

```sh
npm ci
npm --prefix backend ci
```

Copiar `backend/.env.example` a `backend/.env`. Completar allí los datos de Aiven,
`JWT_SECRET` (aleatorio, mínimo 32 bytes) y `DB_SSL_CA` con la ruta al certificado CA.
No pegar estos valores en el chat, no subir `.env` ni certificados a Git y no usar
variables `VITE_*` para secretos. La conexión remota verifica TLS y su certificado.

El frontend funciona con `/api` mediante el proxy de Vite. `.env.example` de la raíz
documenta cómo cambiar esa URL. La API acepta los orígenes indicados en
`FRONTEND_ORIGIN`; para acceder desde otro dispositivo debe añadirse el origen exacto.
El reconocimiento de voz, ubicación y service worker dependen del soporte y permisos
del navegador; para probarlos fuera de localhost se necesita HTTPS.

## Preparar la base

El servidor **no ejecuta migraciones al arrancar**. Los archivos se encuentran en
`backend/migrations`. Revisar el destino y respaldar la base antes de modificarlos.

Para una base existente que ya contiene las 11 tablas del SQL entregado:

```sh
npm --prefix backend run db:migrate
npm --prefix backend run db:migrate -- --apply
```

El primer comando muestra el plan sin ejecutar SQL. El segundo aplica las ampliaciones
y los catálogos a `DB_NAME`. Para una base **nueva y vacía**, ya creada en MySQL:

```sh
npm --prefix backend run db:migrate -- --baseline --apply
```

El runner adapta la selección de base del SQL original a `DB_NAME`, registra checksum
y estado de cada migración, y evita ejecuciones simultáneas. MySQL no revierte DDL:
si una migración queda parcial, se detiene y requiere revisar el esquema; no borra tablas
ni reintenta silenciosamente. Los cuatro sectores iniciales son configuración para el
piloto de Pueblo Libre, no una certificación de límites administrativos.

## Ejecutar

En dos terminales desde la raíz:

```sh
npm run dev:api
```

```sh
npm run dev
```

Abrir `http://localhost:8444`. La API escucha en el puerto 3002.
`GET /api/health` comprueba disponibilidad de la base y del esquema.
Sin configuración, se devuelve un error explícito; no se inventan publicaciones ni usuarios.

En producción se necesita HTTPS, `NODE_ENV=production`, `COOKIE_SECURE=true`, un
origen autorizado y un proxy que envíe `/api` al backend. El directorio `dist` de Vite
contiene solamente el frontend; publicar esa carpeta no despliega la API ni MySQL.

## Recorrido de demostración

### Fotos opcionales en productos y servicios

En **Ofrecer producto o servicio** hay un campo de foto opcional con vista previa.
Se admite una foto JPG, PNG o WebP de hasta 5 MB. Al editar, elegir otra foto la
reemplaza; **Quitar foto** la elimina al guardar; editar solo el texto conserva la
imagen anterior. Publicar sin foto mantiene el diseño con su icono de producto o servicio.
La imagen se muestra en la tarjeta y en el detalle de la publicación.

La migración `006_fotos_publicaciones.sql` añade dos columnas opcionales. El servidor
valida y convierte la foto en JPEG, corrige su orientación, limita sus dimensiones a
1600 px y elimina los metadatos. Guarda el resultado (hasta 2 MB) en MySQL junto a la
publicación; no necesita archivos locales persistentes ni un servicio externo de imágenes.
La publicación y la foto se guardan en la misma transacción. No se modifican fotos de
otros vecinos y las imágenes de publicaciones no públicas solo son accesibles por su dueño.
El proxy de producción debe permitir cuerpos JSON de hasta 8 MB en POST/PATCH de
publicaciones y avisos. Las demás rutas conservan el límite de 64 KB.

### Flyers y vigencia de avisos

En **Crear aviso** puedes subir un flyer JPG, PNG o WebP de hasta 5 MB, con vista
previa y opción para quitarlo antes de publicar. La tarjeta muestra el flyer completo
sin recortarlo y permite abrirlo en otra pestaña. La carga es opcional.
La migración `007_fotos_avisos.sql` añade el almacenamiento de imágenes normalizadas
con las mismas validaciones de las fotos de productos; los enlaces externos existentes
siguen funcionando.

Los avisos nuevos requieren fecha y hora futuras en la hora local del dispositivo.
Al llegar ese momento dejan de aparecer públicamente y su estado devuelto pasa a
`vencido`; no se elimina el registro. Si existe un `venceEn` anterior, se retira antes.
La API controla la vigencia en listados, detalles e imágenes. La pantalla también
retira los avisos que vencen mientras permanece abierta o al volver del segundo plano,
incluidos los datos guardados sin conexión. No necesita cron ni un servidor de tareas.
Los avisos antiguos sin ninguna fecha conservan su visibilidad hasta que su autor
configure una fecha o los cancele; no se les asigna una fecha inventada.

### Confirmación de asistencia y cambios de actividad

Al crear un aviso, **Lugar de la actividad** permite elegir una sugerencia de dirección
o abrir un mapa en una ventana con GPS, pin arrastrable y zoom táctil. El mapa no
ocupa espacio permanente en el formulario. Confirmar copia la selección; volver
conserva el lugar anterior y los demás campos. El punto es obligatorio para publicar
un aviso nuevo y se guarda como una ubicación independiente del perfil.

El lugar y la referencia seleccionados serán públicos; el formulario lo indica antes
de publicar. La tarjeta muestra la dirección y **Ver ubicación**, con acceso a Google
Maps. La migración `010_ubicacion_publica_actividades.sql` diferencia ese lugar de las
ubicaciones privadas: las referencias heredadas por avisos antiguos no se publican
automáticamente. Cambiar después el punto por API notifica a los asistentes confirmados.

El organizador dispone de **Editar actividad o ubicación** en sus tarjetas. El
formulario carga título, descripción, categoría, flyer, fecha y lugar actuales. Puede
reemplazar o quitar el flyer y cambiar el lugar con el mismo selector de mapa.
Guardar envía únicamente los campos modificados: editar texto no borra la foto,
el lugar ni cambia una fecha pasada; volver o cerrar descarta los cambios pendientes.
Los cambios de fecha o ubicación notifican a los asistentes confirmados. Cambiar la
fecha exige una fecha futura y elimina el vencimiento anterior. Una actividad cancelada
no permite edición: el organizador puede eliminarla permanentemente. Un control de revisión evita sobrescribir otra edición:
si la actividad cambió, cerrar y abrir de nuevo el formulario carga la versión actual.

Los avisos cancelados no muestran **Compartir por WhatsApp**. Solo su organizador
ve **Eliminar permanentemente**, que requiere confirmar que la acción no se puede
deshacer. Se elimina el registro, su flyer y la asistencia; también el lugar público
si ya no lo utiliza ningún otro registro. Nunca se borra una ubicación privada del
perfil. La migración `011_notificaciones_actividades_eliminadas.sql` conserva las
notificaciones pendientes con referencia nula, para que la cancelación llegue a los
asistentes al reconectarse. No se borran actividades reales al aplicar la migración.
El cliente actualiza su lista y su caché local al eliminar.

Los vecinos con sesión pueden marcar **Asistiré** o retirar su confirmación. Las
tarjetas muestran el total de confirmaciones, sin publicar nombres de los asistentes.
**Mis asistencias** permite seguir las actividades confirmadas, incluidas las que
posteriormente se cancelaron o vencieron. **Mis actividades** muestra al organizador
sus avisos y el botón **Postergar o cancelar**. El organizador decide qué hacer según
la participación; no hay un umbral que cancele actividades automáticamente.

Para postergar se exige una fecha futura posterior a la original y un motivo. Se
conservan las confirmaciones, que los vecinos pueden retirar, y el vencimiento anterior
se sustituye por la nueva fecha. Para cancelar también se solicita el motivo y la
actividad se retira del listado público. Ambos cambios notifican a quienes siguen
confirmados, incluidos los cambios de fecha/estado realizados mediante PATCH.

La migración `008_asistencia_avisos_notificaciones.sql` guarda confirmaciones y
notificaciones por usuario. El cambio y sus notificaciones son transaccionales;
reintentar la misma operación no duplica confirmaciones ni notificaciones.
La campana consulta las novedades cada 20 segundos mientras la app está visible y
al recuperar conexión o volver a la app. Las notificaciones pendientes se conservan
en el servidor y la caché se separa por cuenta. Se entregan dentro de AYNI, sin push
del sistema operativo, correo ni WhatsApp. No se necesita mantener la app abierta
para conservar una notificación pendiente, pero sí abrirla con conexión para recibirla.

### Ubicación y mapa comunitario

- Al crear una cuenta, **Dirección o referencia** es un campo compacto con un botón
  opcional **Elegir ubicación**. Este abre una ventana superpuesta para buscar una
  dirección, usar GPS o elegir un punto. Al seleccionar un resultado y confirmar,
  se autocompleta el campo y se guarda el punto elegido en el formulario. Cancelar
  conserva la dirección anterior y los demás datos del registro.
  El punto se guarda en el perfil al crear la cuenta y se usa al entrar
  para buscar cerca de ti; la dirección y las coordenadas exactas son privadas.
  También puedes registrarte solo con una referencia escrita. Al escribir una calle
  aparecen sugerencias; al elegir un punto o usar GPS se completa una dirección
  aproximada que puedes revisar y corregir antes de crear la cuenta.
- En **Tu zona**, usa GPS, busca una dirección en Perú o
  selecciona un punto en el mapa. El GPS requiere permiso y HTTPS o localhost.
  Con teclado, enfoca el mapa, mueve el centro con las flechas y pulsa Enter.
- El punto de búsqueda filtra servicios y pedidos dentro de un
  radio de 1, 1.5 o 2 km, sin restringir por comunidad o sector.
  Sin un punto elegido, se consulta sin filtro geográfico. Los formularios no piden
  comunidad ni sector; las asociaciones existentes de la base se conservan internamente.
  Buscar en otro lugar no cambia el perfil; la casilla de guardado lo hace explícito.
- Al crear un pedido u ofrecer un producto o servicio puedes elegir otro punto
  propio de esa publicación. Si lo omites, se usa tu ubicación de perfil cuando
  está disponible. Los pedidos offline conservan el punto elegido.
- **Cerca de mí** conserva el diseño con saludo, ubicación, buscador y filtros.
  El mapa de productos y servicios aparece dentro de un bloque con bordes redondeados,
  y debajo se muestran las tarjetas de todos los productos y servicios de la búsqueda.
  El mapa es un componente de la página, sin ocupar toda la pantalla.
  Al tocar un marcador se abre su detalle, donde el dueño también puede editarlo.
  El encuadre incluye automáticamente todos los puntos cargados que coinciden con
  los filtros. Los pedidos de ayuda se consultan en **Ayuda vecinal**.
  No hay que seleccionar publicaciones una por una para ubicar sus marcadores.
- Si varias publicaciones comparten coordenadas aproximadas, sus iconos se separan
  visualmente y se conectan con su zona de origen mediante líneas. No se alteran las
  coordenadas guardadas. Al elegir un marcador se abre su detalle sin ocultar
  ni volver a centrar los demás puntos del mapa.
- Los iconos se asignan por tipo, categoría y título: alimentos, herramientas,
  hogar, clases, donaciones, intercambios, urgencias, bicicletas, tecnología y mascotas.
  Color y distintivo P/S/A diferencian productos, servicios y ayuda. La leyenda explica
  los símbolos. Cada detalle permite abrir la zona en Google Maps. Las publicaciones
  sin coordenadas no aparecen como puntos; se indica su cantidad sobre el mapa.
  Un filtro por distancia requiere coordenadas. Puedes añadirlas al editar un servicio.
- Para productos, servicios y pedidos, la API pública entrega `mapaLatitud` y `mapaLongitud` redondeadas a tres decimales
  (una cuadrícula de aproximadamente 110 m), nunca el punto exacto ni la referencia
  privada. La distancia se calcula con el punto privado y se redondea a 50 m.

Se utiliza Leaflet con OpenStreetMap; no hace falta una clave de Google Maps.
Los mapas necesitan internet. Después de escribir al menos tres caracteres y hacer
una pausa de 650 ms, Photon ofrece sugerencias de calles en Perú. Elegir un punto
o usar GPS consulta su dirección aproximada y completa el campo, sin mover el punto
elegido. El texto y las coordenadas consultadas se envían a Photon; si no hay una
dirección disponible, puedes escribir una referencia manualmente.
La API comparte consultas simultáneas iguales, limita las llamadas a una por segundo
por proceso y guarda resultados durante diez minutos. `PLACES_API_URL` permite usar
una instancia Photon propia; la instancia pública de demostración admite uso moderado
y no garantiza disponibilidad. En producción, dimensionar el proveedor y compartir
los límites entre instancias. `VITE_MAP_TILE_URL` y `VITE_MAP_ATTRIBUTION` configuran
el mapa. La ruta anterior `/ubicaciones/buscar` conserva su proveedor `GEOCODING_URL`
para búsquedas explícitas; no se utiliza para autocompletado.
Consultar las políticas de [teselas](https://operations.osmfoundation.org/policies/tiles/)
y [búsqueda](https://operations.osmfoundation.org/policies/nominatim/) antes del despliegue.

### Colaboración entre vecinos

1. Registrar dos vecinos en dos perfiles distintos del navegador (o uno normal y otro
   privado). Compartir ubicación es opcional; no se solicita elegir un sector.
2. Con el primero, publicar un servicio o producto y una solicitud de ayuda.
3. Con el segundo, encontrar el pedido y describir qué aporte puede realizar.
4. El solicitante acepta. Pueden aceptarse varios colaboradores.
5. El colaborador marca su aporte como entregado; el solicitante confirma la recepción.
6. El solicitante valora la colaboración y, cuando toda su necesidad está cubierta,
   marca el pedido como resuelto. Confirmar un aporte no cierra el pedido.
7. Crear un recurso compartido, solicitar unidades y confirmar la reserva desde su dueño.
   La disponibilidad disminuye al reservar; entregar no vuelve a descontarla.
8. Con una sesión ya iniciada y catálogos descargados, perder conexión y crear un pedido.
   Aparece como pendiente. Al recuperar conexión se sincroniza con el mismo identificador.

No se incluyen usuarios o actividades ficticias en la API. Las pruebas de integración
crean exclusivamente sus propios registros en una base local de prueba.

## Validación

```sh
npm run build
npm --prefix backend run build
npm --prefix backend test
```

Los formularios de acceso y registro permiten mostrar u ocultar la contraseña con el
icono del ojo. El registro exige repetirla y comprobar que ambas coincidan.
En registro y perfil, el celular es opcional: el prefijo +51 aparece fijo y se ingresan
nueve dígitos que empiecen con 9. Al pegar un número completo con +51, se separa el
prefijo automáticamente. La API valida y guarda el celular en formato `+51987654321`.

Para probar estos formularios en Chromium con datos ficticios, sin usar la base real:

```sh
npx playwright install chromium
npm run test:account
```

## Integración continua y despliegue

`.github/workflows/ayni-ci-deploy.yml` valida cada pull request hacia `main` y cada
push a `main` (incluido un merge): compila frontend y backend, ejecuta las pruebas
unitarias y crea un MySQL desechable en GitHub Actions para aplicar el esquema y
probar el recorrido de API entre vecinos. No necesita Docker instalado en las laptops
y no usa Aiven para las pruebas.

La base MySQL de producción permanece en Aiven. Sus credenciales TLS se configuran
solo en el entorno del backend en producción; el workflow no se conecta ni aplica
migraciones a esa base. El frontend está alojado en AWS. El workflow dispara el hook de
Render para la API; la publicación del frontend requiere configurar el servicio de AWS
que usa el proyecto.

Para habilitar el despliegue de la API tras un merge a `main`, crea un deploy hook del
servicio backend en Render y guárdalo en GitHub, en **Settings → Secrets and variables → Actions**:

- `RENDER_BACKEND_DEPLOY_HOOK`: hook del servicio de la API.

Desactiva el auto-deploy directo de la API en Render para que el workflow la despliegue
solo después de que compilaciones y pruebas pasen. Configura el auto-deploy de AWS desde
`main` cuando confirmemos el servicio usado. Las migraciones de producción a Aiven se
revisan y aplican por separado.

### Verificación sin conexión

```sh
npx playwright install chromium
npm run test:offline
```

Comprueba diez escenarios en Chromium con una API ficticia aislada: recarga offline,
caché, persistencia y sincronización de pedidos, cambios de cuenta, sesión vencida,
reintentos sin duplicados y fallos de almacenamiento. No escribe en la base real.
La recarga sin conexión está disponible en la versión compilada, después de una primera
carga con internet. El servidor de desarrollo no instala el service worker.
Instrucciones y límites: [Verificación offline](docs/VERIFICACION_OFFLINE.md).

Las pruebas con MySQL son opt-in. Preparar una base local cuyo nombre comience por
`ayni_test_`, aplicar sus migraciones y configurar sus variables separadamente.
Activar `AYNI_TEST_DB=true` antes de ejecutar las pruebas de integración. Nunca apuntarlas
a Aiven ni a una base de usuarios reales. Los registros de prueba se conservan: no hay
limpieza destructiva automática.

## Decisiones y límites

- JWT de duración limitada en cookie HttpOnly; no se guardan tokens en localStorage.
  Las mutaciones validan origen y cabecera propia. La cola también comprueba el usuario
  esperado para impedir publicar borradores de otra cuenta.
- Las ubicaciones exactas del perfil y de productos, servicios y pedidos son privadas.
  El lugar que el organizador elige explícitamente para una actividad sí es público.
  Para las ubicaciones privadas, la API devuelve sector y distancia redondeada;
  el mapa muestra una zona aproximada, no el domicilio de un vecino.
- La cola de pedidos y las notificaciones locales usan SQLite en el navegador mediante
  sql.js, guardado en IndexedDB. La caché de respuestas usa IndexedDB por cuenta;
  el service worker guarda solo la aplicación compilada y su WebAssembly. Publicado
  significa persistido y confirmado por el servidor; un pendiente todavía no está publicado.
- Los vistos buenos proceden de colaboraciones confirmadas con calificación 4 o 5;
  las demás calificaciones siguen visibles como reseñas. Una reseña puede editarse.
  Las reseñas históricas de publicaciones se identifican como no verificadas.
- Los recursos con cantidades representan donaciones/consumibles. Los préstamos de
  herramientas usan colaboraciones; todavía no hay inventario de devoluciones.
- AYNI coordina apoyo comunitario; los avisos no se presentan como información oficial.

Contratos y errores: [docs/API.md](docs/API.md). Decisiones de datos:
[backend/migrations/README.md](backend/migrations/README.md).
