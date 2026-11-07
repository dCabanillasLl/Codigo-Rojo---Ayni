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

MySQL hace commit implícito de DDL. Aplicar `001` una sola vez, guardar evidencia de
éxito y, si falla parcialmente, inspeccionar el esquema antes de reintentarlo.
No hay rollback destructivo automático. Los registros anteriores conservan UUID y
confirmaciones NULL; sus reseñas no se convierten en verificadas.

## Decisiones

- `pendiente` es propuesta; `aceptada` con `entregada_en` es entrega por confirmar;
  `completada` con `confirmada_en` es colaboración confirmada. Se preservan `rechazada`
  y `retirada` para distinguir quién canceló. El solicitante cierra el pedido aparte.
- Una reseña de colaboración referencia una oferta única. Autor y destinatario se
  derivan del solicitante y voluntario, conservando la relación sin duplicar identidades.
- Disponibilidad = total − reservas aceptadas − entregas. No se almacena un contador
  duplicado. La API bloquea la fila del recurso durante cada cambio de reserva.
- Los recursos de inventario son donaciones/consumibles. Para herramientas prestadas,
  usar el flujo de colaboración; no se simula gestión de devoluciones de inventario.
- La creación de solicitudes y reservas usa UUID + usuario + huella del contenido.
  Reintentar devuelve el original; reutilizar el UUID con otro contenido produce 409.
- El teléfono permanece privado por defecto. Solo se publica en las fichas del vecino
  después de guardar un número internacional y activar su consentimiento en el perfil.
- Los flyers de avisos son referencias HTTPS a imágenes alojadas externamente; AYNI no
  recibe ni procesa archivos de imagen.
