# AYNI: una comunidad que se ayuda

AYNI es una aplicación web para conectar a vecinos. Permite encontrar productos y
servicios del barrio, publicar necesidades, ofrecer ayuda y compartir recursos.

## Qué puedes hacer

- **Encontrar cerca de ti:** usar el buscador, consultar un mapa dentro de un bloque
  y ver las tarjetas de productos y servicios debajo. Los pedidos están en **Ayuda vecinal**.
- **Ofrecer algo:** publicar un producto o servicio, señalar dónde lo ofreces y,
  si quieres, añadir una foto. Puedes previsualizarla, cambiarla o quitarla al editar.
- **Pedir ayuda:** describir lo que necesitas y elegir una ubicación para ese pedido.
- **Colaborar:** responder a un pedido, acordar un aporte y confirmar su entrega.
  Un mismo pedido puede recibir ayuda de varios vecinos.
- **Compartir recursos:** ofrecer donaciones o insumos y gestionar sus reservas.
- **Publicar avisos:** compartir actividades e información vecinal.
- **Construir confianza:** valorar colaboraciones confirmadas y consultar la reputación.

## Cómo funciona el mapa

En **Cerca de ti**, el diseño conserva el saludo, la zona, el buscador y los filtros.
Los productos y servicios con ubicación aparecen al mismo tiempo en un mapa dentro
de su propio bloque. Debajo están sus tarjetas, con descripción, precio y opciones
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
Las publicaciones sin coordenadas no pueden mostrarse como puntos ni calcular su
cercanía, pero siguen apareciendo en las tarjetas cuando se consulta por comunidad.

## Ejemplo

Una vecina publica que necesita una escalera. Otra persona ve el pedido en el mapa,
ofrece prestársela y ambas coordinan el aporte. La solicitante confirma que lo recibió
y puede valorar la ayuda. Cuando su necesidad está cubierta, cierra el pedido.

La aplicación guarda su información en MySQL y usa un servidor para gestionar las
cuentas y publicaciones. El mapa utiliza OpenStreetMap. Si pierdes internet, puedes
guardar un pedido en el dispositivo para enviarlo al recuperar la conexión con tu sesión activa.
