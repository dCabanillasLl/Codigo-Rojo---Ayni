-- Amplía el ciclo de vida de una interacción sin modificar los registros existentes.
-- CONFIRMADA sigue requiriendo la confirmación de ambas partes (015).
ALTER TABLE interacciones_publicacion
  MODIFY COLUMN estado ENUM('PENDIENTE','ACEPTADA','EN_CURSO','CONFIRMADA','RECHAZADA','CANCELADA')
    NOT NULL DEFAULT 'PENDIENTE';
