# Verificación del modo sin conexión

Verificado el 8 de noviembre de 2026 con Chromium sobre el frontend compilado.
Las pruebas usan usuarios, publicaciones y una API ficticios en `127.0.0.1:8731`.
No acceden a Aiven, no crean pedidos reales y no envían mensajes ni correos.

## Resultado

Antes de la corrección, recargar sin red fallaba con `net::ERR_INTERNET_DISCONNECTED`:
existía la cola local pero no se instalaba un service worker para cargar la aplicación.
Ahora se guarda la aplicación compilada, incluido el archivo WebAssembly de SQLite.
Las respuestas de API se mantienen separadas por cuenta en IndexedDB; el service
worker no guarda APIs, fotos privadas, flyers ni mapas externos.

| Escenario automatizado | Resultado |
|---|---|
| Recargar sin internet y ver publicaciones consultadas | Correcto |
| Guardar un pedido, recargar offline y enviarlo al reconectar | Correcto, una publicación |
| Cambiar de cuenta con un pedido pendiente | No se envía desde la otra cuenta |
| Reconectar con sesión vencida y volver a entrar | Se conserva el pedido hasta recuperar la sesión |
| Perder la respuesta después de publicar y reintentar | Mismo identificador, sin duplicar el pedido |
| Revisar la caché del service worker | Solo aplicación y SQLite, sin respuestas privadas |
| Buscar algo que nunca se consultó | Informa que no hay datos guardados, sin mostrar otra búsqueda |
| Recargar desde una pantalla móvil | Se carga y muestra el aviso sin conexión |
| Fallar la API aunque el navegador indique conexión | Recupera la caché |
| Fallar la escritura local por falta de espacio | Muestra el error, no anuncia que el pedido quedó guardado |

También pasaron las 55 pruebas del backend y su compilación. Las lecturas con
`X-AYNI-User` verifican la cuenta activa; una cuenta distinta no puede llenar la
caché de otro usuario. No se reutiliza caché ante 401, 403, 404 o cambio de sesión.

## Repetir las pruebas

```sh
npm install
npx playwright install chromium
npm run test:offline
npm --prefix backend test
npm --prefix backend run build
```

`test:offline` compila el frontend y levanta una API ficticia aislada. Los archivos
de diagnóstico se guardan en `test-results/`, excluido de Git. El puerto 8731 debe
estar libre; las pruebas no sustituyen el servidor real de desarrollo.

## Probar manualmente

1. Compila con `npm run build`. Detén antes el servidor de desarrollo si ocupa el mismo
   puerto y abre `npm run preview` en el origen ya autorizado por tu backend. Mantén
   el backend funcionando durante la preparación.
2. Con internet, inicia sesión y visita las pantallas que quieras consultar después.
   Espera a que la aplicación termine de cargar para instalar su contenido offline.
3. Desconecta la red y recarga. Podrás consultar esas vistas con la fecha de guardado.
   Las búsquedas o pantallas nuevas necesitan conexión para descargarse por primera vez.
4. En **Necesito ayuda**, guarda un pedido. Aparece en **Pendientes de envío** y debe
   seguir ahí al recargar. Si solo quieres comprobar la funcionalidad sin publicar,
   usa las pruebas automáticas anteriores, que no crean registros reales.
5. Al recuperar conexión, con la app abierta y la misma cuenta activa, el pedido se
   envía. Si la sesión venció, vuelve a iniciar sesión. Los rechazos definitivos se
   muestran para revisión y no se reintentan indefinidamente.

## Límites

- Se necesita una primera carga con conexión, almacenamiento disponible y HTTPS o
  localhost para instalar el service worker. `npm run dev` conserva la caché de datos
  y la cola, pero no instala la aplicación compilada para recargar offline.
- Mapas, sugerencias de direcciones, fotos, flyers nuevos, registro y operaciones
  que modifican datos del servidor requieren conexión. La cola offline admite pedidos
  de ayuda; no se simula que una actividad, reserva o confirmación quedó publicada.
- El envío ocurre al abrir o reconectar la app con sesión válida; no se ejecuta
  en segundo plano con el navegador cerrado.
- La información guardada puede cambiar o quedar obsoleta. Los avisos con fecha vencida
  siguen retirándose de la vista aunque el dispositivo esté desconectado.
- Las nuevas versiones del service worker esperan a que se cierren las pestañas de
  la versión anterior, para mantener juntos el HTML y los archivos de la misma versión.
- Borrar los datos del sitio elimina caché y pedidos locales todavía no enviados.
