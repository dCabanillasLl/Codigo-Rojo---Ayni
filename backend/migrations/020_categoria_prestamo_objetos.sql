-- Clarifica el préstamo como préstamo de objetos y oculta intercambio del catálogo activo.
UPDATE categorias_ayuda
SET nombre = 'Préstamo de objetos',
    descripcion = 'Pedir herramientas y objetos prestados, con devolución'
WHERE nombre = 'Préstamo';