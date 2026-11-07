-- Catálogos iniciales reales de la aplicación; no crea usuarios ni actividades ficticias.
-- Reejecutable: las claves únicas por nombre evitan duplicados.
INSERT IGNORE INTO sectores_vecinales (nombre, distrito, ciudad, codigo_pais)
VALUES ('Sector 1', 'Pueblo Libre', 'Lima', 'PE'),
       ('Sector 2', 'Pueblo Libre', 'Lima', 'PE'),
       ('Sector 3', 'Pueblo Libre', 'Lima', 'PE'),
       ('Sector 4', 'Pueblo Libre', 'Lima', 'PE');

INSERT IGNORE INTO categorias_publicacion (nombre, descripcion)
VALUES ('Alimentos', 'Productos de alimentación del barrio'),
       ('Reparaciones', 'Reparaciones y mantenimiento'),
       ('Hogar', 'Productos y servicios para el hogar'),
       ('Clases y oficios', 'Clases, asesoría y oficios'),
       ('Otros', 'Otros productos y servicios');

INSERT IGNORE INTO categorias_ayuda (nombre, descripcion)
VALUES ('Préstamo', 'Prestar herramientas y objetos'),
       ('Un favor', 'Apoyo temporal entre vecinos'),
       ('Donación', 'Compartir bienes sin dinero'),
       ('Intercambio', 'Intercambiar habilidades o apoyo'),
       ('Apoyo urgente', 'Necesidad comunitaria urgente');

INSERT IGNORE INTO categorias_avisos (nombre, descripcion)
VALUES ('Actividades', 'Actividades del barrio'),
       ('Campañas', 'Campañas y acciones vecinales'),
       ('Aviso vecinal', 'Información aportada por vecinos, no oficial');
