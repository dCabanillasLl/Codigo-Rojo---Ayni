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

Abrir `http://localhost:8443`. La API escucha en el puerto 3001.
`GET /api/health` comprueba disponibilidad de la base y del esquema.
Sin configuración, se devuelve un error explícito; no se inventan publicaciones ni usuarios.

En producción se necesita HTTPS, `NODE_ENV=production`, `COOKIE_SECURE=true`, un
origen autorizado y un proxy que envíe `/api` al backend. El directorio `dist` de Vite
contiene solamente el frontend; publicar esa carpeta no despliega la API ni MySQL.

## Recorrido de demostración

1. Registrar dos vecinos en dos perfiles distintos del navegador (o uno normal y otro
   privado). Elegir sector; compartir ubicación es opcional.
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

Las pruebas con MySQL son opt-in. Preparar una base local cuyo nombre comience por
`ayni_test_`, aplicar sus migraciones y configurar sus variables separadamente.
Activar `AYNI_TEST_DB=true` antes de ejecutar las pruebas de integración. Nunca apuntarlas
a Aiven ni a una base de usuarios reales. Los registros de prueba se conservan: no hay
limpieza destructiva automática.

## Decisiones y límites

- JWT de duración limitada en cookie HttpOnly; no se guardan tokens en localStorage.
  Las mutaciones validan origen y cabecera propia. La cola también comprueba el usuario
  esperado para impedir publicar borradores de otra cuenta.
- Las ubicaciones exactas son privadas. La API devuelve sector y distancia redondeada;
  el mapa muestra una zona aproximada, no el domicilio de un vecino.
- La cola y caché usan IndexedDB porque este proyecto es web. No se migró a React Native
  ni se añadió SQLite. Publicado significa persistido y confirmado por el servidor.
- Los vistos buenos proceden de colaboraciones confirmadas con calificación 4 o 5;
  las demás calificaciones siguen visibles como reseñas. Una reseña puede editarse.
  Las reseñas históricas de publicaciones se identifican como no verificadas.
- Los recursos con cantidades representan donaciones/consumibles. Los préstamos de
  herramientas usan colaboraciones; todavía no hay inventario de devoluciones.
- AYNI coordina apoyo comunitario; los avisos no se presentan como información oficial.

Contratos y errores: [docs/API.md](docs/API.md). Decisiones de datos:
[backend/migrations/README.md](backend/migrations/README.md).
