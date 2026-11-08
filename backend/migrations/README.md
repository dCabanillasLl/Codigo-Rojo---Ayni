# Migraciones de AYNI

Estos archivos se preparan para revisión; no se ejecutan al iniciar el servidor.
Usar una cuenta con permisos DDL, verificar la base de destino y hacer respaldo.

1. `000_baseline.sql` es una copia exacta del archivo original entregado. Incluye
   `CREATE DATABASE ... ayni` y `USE ayni`: **solo sirve para una instalación nueva**.
   No ejecutarlo sobre la base Aiven ya existente. En servidores que asignan una base
   con otro nombre, revisar estas dos instrucciones antes de una instalación nueva.
2. `001_colaboraciones_recursos.sql` amplía la base existente. Conserva las 11 tablas
   originales y sus ENUM. Añade confirmaciones de entrega, cancelaciones, idempotencia,
   reseñas verificadas por colaboración y recursos con reservas.
3. `002_catalogos.sql` añade categorías y cuatro sectores iniciales de Pueblo Libre.
   Es reejecutable. No añade usuarios, solicitudes, ofertas ni reseñas de demostración.
4. `003_flyers_whatsapp.sql` añade la URL HTTPS del flyer y la preferencia explícita
   `telefono_publico`, desactivada por defecto. Aplicar también a las bases existentes
   antes de desplegar la versión que habilita esas funciones.
5. `004_dni_hash.sql` añade una huella HMAC única para permitir acceso con DNI. El DNI
   original nunca se guarda; configura `DNI_HASH_SECRET` y consérvalo estable para no
   invalidar las cuentas creadas con este método.
6. `005_registro_dni_sin_correo.sql` hace opcional el correo y añade la zona general
   `Pueblo Libre` para registrar sin selector de sector. Respeta cuentas con correo
   existentes; aplicar antes de habilitar el nuevo registro.
7. `006_fotos_publicaciones.sql` añade una foto opcional (`imagen` y `imagen_hash`)
   a cada producto o servicio. Las filas existentes permanecen sin foto. Se almacena
   el JPEG normalizado y su huella; las consultas de listados no descargan el BLOB.
8. `007_fotos_avisos.sql` añade una imagen opcional normalizada y su huella a cada
   aviso. Conserva sus fechas y enlaces externos anteriores. No borra ni vence filas.
   La vigencia se aplica al consultar, según `fecha_evento` y `vence_en`, sin cron.
9. `008_asistencia_avisos_notificaciones.sql` añade las confirmaciones por actividad y
   usuario, la revisión del evento y las notificaciones persistentes de cambios.
   Cada cambio y sus notificaciones se guardan en una misma transacción. La combinación
   actividad/revisión/destinatario es única para evitar avisos duplicados.
10. `009_estado_cambio_actividad.sql` conserva el tipo del último cambio de actividad
    para distinguir la etiqueta de postergación de otras actualizaciones. No modifica
    las fechas, estados ni publicaciones existentes.
11. `010_ubicacion_publica_actividades.sql` marca si el lugar de un aviso se eligió
    explícitamente para ser público. Los avisos anteriores quedan en `0`: no expone
    direcciones ni coordenadas privadas heredadas del perfil. La ubicación se guarda
    en una fila propia y no modifica el domicilio del organizador.
12. `010_vencimiento_solicitudes.sql` asigna fecha límite a solicitudes antiguas sin
    vencimiento y marca como vencidas las que ya superaron el plazo. Aplicar para que
    los pedidos existentes tampoco permanezcan publicados indefinidamente.
13. `011_notificaciones_actividades_eliminadas.sql` permite borrar una actividad
    cancelada sin perder las notificaciones pendientes: su referencia al aviso pasa
    a NULL. La asistencia se elimina por cascada. Esta migración no elimina actividades.
14. `011_notificaciones_correo.sql` añade la preferencia privada de avisos por correo,
    desactivada para todas las cuentas existentes hasta que cada persona la active.
15. `012_verificacion_correo.sql` habilita códigos de confirmación de un solo uso,
    almacenados como HMAC y con vencimiento de 10 minutos. Los correos existentes
    empiezan sin verificar.
16. `013_notificaciones_interacciones.sql` crea notificaciones privadas persistentes
    para propuestas y cambios de estado de colaboraciones vecinales.
17. `014_resenas_reciprocas.sql` conserva las reseñas existentes y permite una reseña
    independiente por cada participante de una colaboración confirmada.
18. `015_visto_bueno_verificado.sql` agrega el estado de verificación de identidad y de
    pertenencia a sector, registra interacciones bilaterales con publicaciones y enlaza
    reseñas de productos/servicios a una interacción confirmada. Las identidades y zonas
    históricas se importan como `PENDIENTE`; las reseñas existentes quedan
    `NO_VERIFICADA`. No copia DNI, documentos, domicilios ni coordenadas a estas tablas.
19. `016_revision_identidad_zona.sql` registra quién revisó el estado actual y crea una
    bitácora de cambios de identidad y zona. Guarda IDs internos, estados, método y motivo;
    no almacena DNI, direcciones, coordenadas ni evidencias adjuntas.
20. `017_ciclo_interacciones_publicacion.sql` amplía los estados de `interacciones_publicacion`
    para representar aceptación e inicio antes de las confirmaciones bilaterales. No altera
    filas existentes; `CONFIRMADA` sigue requiriendo ambas confirmaciones.
21. `018_estado_recomendaciones.sql` agrega `PENDIENTE` a las reseñas enlazadas a una
    experiencia que aún no cumple identidad, zona y confirmación. `NO_VERIFICADA` queda para
    opiniones sin evidencia vinculada. Las reseñas históricas mantienen `NO_VERIFICADA`; la
    API calcula el sello vigente para reflejar revocaciones y vencimientos.

Las migraciones con el mismo prefijo numérico surgieron en ramas paralelas. El runner
las identifica por el nombre completo: conservar los nombres y los archivos ya
aplicados, sin renumerarlos, permite integrar ambas bases sin repetir SQL.
Para `011_notificaciones_correo.sql`, el runner también reconoce de forma segura el
DDL ya aplicado con la versión histórica `008_notificaciones_correo.sql`: solo lo
marca completado si comprueba que la columna existente tiene el tipo y valor por
defecto esperados.

El runner normaliza únicamente saltos de línea LF/CRLF para no confundir la conversión
de Git en Windows con un cambio de SQL. Acepta ambas variantes históricas de checksum
sin reescribir el historial; cualquier cambio del contenido SQL sigue bloqueando la ejecución.

MySQL hace commit implícito de DDL. Aplicar `001` una sola vez, guardar evidencia de
éxito y, si falla parcialmente, inspeccionar el esquema antes de reintentarlo.
No hay rollback destructivo automático. Los registros anteriores conservan UUID y
confirmaciones NULL; sus reseñas no se convierten en verificadas.

## Decisiones

- `pendiente` es propuesta; `aceptada` con `entregada_en` es entrega por confirmar;
  `completada` con `confirmada_en` es colaboración confirmada. Se preservan `rechazada`
  y `retirada` para distinguir quién canceló. El solicitante cierra el pedido aparte.
- Cada participante puede dejar una reseña por colaboración confirmada. La migración
  conserva las reseñas actuales como valoraciones del solicitante al colaborador;
  autor y evaluado se guardan explícitamente para calcular reputación en ambas direcciones.
- Disponibilidad = total − reservas aceptadas − entregas. No se almacena un contador
  duplicado. La API bloquea la fila del recurso durante cada cambio de reserva.
- Los recursos de inventario son donaciones/consumibles. Para herramientas prestadas,
  usar el flujo de colaboración; no se simula gestión de devoluciones de inventario.
- La creación de solicitudes y reservas usa UUID + usuario + huella del contenido.
  Reintentar devuelve el original; reutilizar el UUID con otro contenido produce 409.
- El teléfono permanece privado por defecto. Solo se publica en las fichas del vecino
  después de guardar un número internacional y activar su consentimiento en el perfil.
- Los flyers nuevos pueden cargarse como JPG, PNG o WebP de hasta 5 MB. Se guarda el
  JPEG normalizado (hasta 1600 px y 2 MB) sin metadatos. Los enlaces HTTPS anteriores
  se conservan por compatibilidad. El archivo no se devuelve en los listados JSON.
- `verificaciones_identidad` guarda solo usuario, estado, método y fechas; `dni_hash`
  continúa en `usuarios` y no se duplica. `pertenencias_zona` referencia el sector, no
  la dirección ni el punto GPS. Los sectores del perfil previos se consideran pendientes,
  nunca verificados automáticamente.
- `interacciones_publicacion` vincula publicación, solicitante y propietario mediante
  claves foráneas; el propietario debe ser el dueño registrado de esa publicación y no
  puede ser el solicitante. Una interacción confirmada requiere confirmación de ambas
  partes y fecha de cierre.
- `resenas.interaccion_id` es opcional. Sin interacción la opinión es `NO_VERIFICADA`;
  con evidencia todavía incompleta es `PENDIENTE`. La API calcula el sello vigente con
  identidad acreditada, zona vigente y experiencia confirmada del mismo autor y
  publicación. Una interacción respalda como máximo una opinión. Las opiniones históricas
  conservan publicación, autor, texto, calificación y fechas sin recibir sello automático.
- Los cambios administrativos de identidad y zona requieren un ID incluido en la
  variable privada `AYNI_REVIEWER_USER_IDS`. La consulta de API Perú solo prellena los
  nombres del registro y queda `PENDIENTE`; no es una prueba de titularidad.
- La revisión de residencia es manual. GPS, sector del perfil y DNI no acreditan
  residencia. El revisor contrasta información fuera del sistema y registra solo el
  método y un motivo breve sin datos sensibles.
