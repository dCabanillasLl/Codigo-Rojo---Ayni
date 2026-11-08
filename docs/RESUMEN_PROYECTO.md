# AYNI: una comunidad que se ayuda

AYNI es una aplicación web para conectar a vecinos. Permite encontrar productos y
servicios del barrio, publicar necesidades, ofrecer ayuda y compartir recursos.

## Qué puedes hacer

- **Encontrar cerca de ti:** usar el buscador, consultar un mapa dentro de un bloque
  y ver las tarjetas de productos y servicios debajo. Los pedidos están en **Ayuda vecinal**.
- **Ofrecer algo:** publicar un producto o servicio, señalar dónde lo ofreces y,
  si quieres, añadir una foto. Puedes previsualizarla, cambiarla o quitarla al editar.
- **Pedir ayuda:** describir lo que necesitas y elegir una ubicación para ese pedido.
  Si ya iniciaste sesión y cargaste las categorías, puedes guardar el pedido sin
  conexión. Se conserva al recargar y se envía al reconectar con la misma cuenta.
  En la versión compilada también puedes volver a abrir la app y consultar las vistas
  que cargaste previamente. Los mapas y las operaciones en el servidor necesitan internet.
- **Colaborar:** responder a un pedido, acordar un aporte y confirmar su entrega.
  Un mismo pedido puede recibir ayuda de varios vecinos.
- **Compartir recursos:** ofrecer donaciones o insumos y gestionar sus reservas.
- **Publicar avisos:** compartir actividades e información vecinal, con un flyer
  opcional que puedes subir desde tu celular. Los avisos nuevos requieren fecha y
  hora de la actividad y dejan de mostrarse automáticamente al llegar ese momento.
  También eliges el lugar: busca una dirección, usa GPS o arrastra el pin en una
  ventana de mapa. La tarjeta muestra la dirección de la actividad y permite abrir
  el mapa o Google Maps. Este lugar será público; tu ubicación privada de perfil
  permanece sin cambios.
  Si ocurre un inconveniente, el organizador puede usar **Editar actividad o ubicación**
  para corregir el texto, la categoría o el flyer, cambiar la fecha o seleccionar otro
  lugar. Los cambios de fecha o lugar avisan a los asistentes confirmados; editar solo
  el texto conserva el flyer y la ubicación. Volver cierra sin guardar los cambios.
  Al cancelar se oculta **Compartir por WhatsApp**. El organizador puede usar
  **Eliminar permanentemente**, pero ya no puede editar los datos ni la ubicación.
  Esta opción pide confirmación antes de borrar. Al confirmar se eliminan la actividad,
  su flyer y las confirmaciones. Las notificaciones de cancelación pendientes se
  conservan para quienes todavía no se hayan conectado.
- **Confirmar asistencia:** marcar **Asistiré** y consultar las actividades en
  **Mis asistencias**. Cada anuncio muestra cuántos vecinos confirmaron.
- **Gestionar actividades:** desde **Mis actividades**, el creador puede postergar
  para una fecha posterior o cancelar, indicando el motivo. Quienes siguen confirmados
  reciben el cambio en la campana de AYNI, aunque se conecten más tarde. La decisión
  depende del organizador; una baja participación no cancela el evento automáticamente.
  Las etiquetas ayudan a identificar el estado: verde para **Vigente**, ámbar para
  **Postergado**, rojo para **Cancelado**, gris para **Vencido**, azul para otros
  cambios de programación y violeta para **Borrador**.
  Cada categoría también tiene su propia etiqueta: **Actividades** en violeta con
  calendario, **Campañas** en verde turquesa con manos de apoyo y **Aviso vecinal**
  en azul con megáfono. Al elegir una categoría al crear el aviso, puedes ver la
  etiqueta que aparecerá en su tarjeta, junto al estado de la actividad.
- **Construir confianza:** valorar colaboraciones confirmadas y consultar la reputación.

## Cómo funciona el mapa

En **Cerca de ti**, el diseño conserva el saludo, la zona, el buscador y los filtros.
Los productos y servicios con ubicación aparecen al mismo tiempo en un mapa dentro
de la pantalla **Cerca de mí**, junto con un filtro visual: puedes elegir **Todo**,
**Productos** o **Servicios** y abrir **Filtros** para seleccionar categoría, distancia
o tus propias publicaciones. Las opciones seleccionadas se resaltan con color y se
muestran como etiquetas que puedes quitar; **Limpiar todo** restablece la búsqueda.
El mapa y las tarjetas muestran los mismos resultados.

El mapa se mantiene en su propio bloque. Debajo están sus tarjetas, con descripción, precio y opciones
de contacto. El mapa ajusta la vista para incluir los puntos de los resultados cargados;
no necesitas ir cambiando de publicación.
Tocar un icono abre su información. Los pedidos tienen su propio mapa en **Ayuda vecinal**.

Los dibujos indican qué se ofrece o se necesita: comida, herramientas, clases,
donaciones, mascotas y otras categorías. El color y las letras P, S y A permiten
distinguir productos, servicios y ayuda. Al tocar un icono puedes ver su ficha.

Cuando varios vecinos publican en la misma zona, los iconos se separan visualmente
para que ninguno quede escondido detrás de otro. Una línea señala su zona de origen.
Esta separación es visual: no cambia la ubicación guardada.

Puedes indicar una ubicación usando GPS, buscando una dirección o eligiendo un punto
en el mapa. Los demás vecinos ven una zona aproximada; tu dirección exacta es privada.
También puedes configurarla al crear tu cuenta, en **Dirección o referencia**.
El botón opcional **Elegir ubicación** abre una ventana con el mapa, sin agrandar
el formulario. Al escribir una calle aparecen sugerencias; al elegir una se completa
el campo y se selecciona su punto. Al pulsar un punto del mapa o usar GPS también se
completa su dirección aproximada, que puedes corregir. También puedes arrastrar el
pin para ajustar el punto: al soltarlo se actualiza la dirección. En el celular,
separa dos dedos para acercar el mapa y júntalos para alejarlo. El pin inicial es
una guía; debes moverlo, elegir un punto, una sugerencia o usar GPS para seleccionarlo.
Si no se encuentra una calle,
puedes escribir una referencia. Confirmar aplica la selección; cancelar conserva lo
que tenías antes de abrir la ventana.
Se guarda en tu perfil para buscar cerca de ti desde el inicio; seleccionar el punto
es opcional si prefieres registrarte únicamente con una referencia escrita.
Las publicaciones sin coordenadas no pueden mostrarse como puntos ni calcular su
cercanía, pero siguen apareciendo en las tarjetas cuando se consulta sin distancia.
No hay que elegir comunidad ni sector en ningún formulario. Las búsquedas usan el
punto del mapa y el radio elegido; sin ubicación se muestran las publicaciones sin
filtro geográfico. Los vínculos internos de datos existentes se conservan automáticamente.

## Ejemplo

Una vecina publica que necesita una escalera. Otra persona ve el pedido en el mapa,
ofrece prestársela y ambas coordinan el aporte. La solicitante confirma que lo recibió
y puede valorar la ayuda. Cuando su necesidad está cubierta, cierra el pedido.

La aplicación guarda su información en MySQL y usa un servidor para gestionar las
cuentas y publicaciones. El mapa utiliza OpenStreetMap. Si pierdes internet, puedes
guardar un pedido en el dispositivo para enviarlo al recuperar la conexión con tu sesión activa.
