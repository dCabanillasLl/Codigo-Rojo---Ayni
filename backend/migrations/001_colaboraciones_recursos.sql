-- AYNI: ampliación aditiva sobre el esquema original de 11 tablas.
-- Ejecutar UNA SOLA VEZ sobre la base seleccionada, después de revisar y respaldar.
-- MySQL 8.0.16+. DDL hace commit implícito: el runner debe registrar cada migración.
-- No recrea tablas originales, no renombra columnas ni modifica sus ENUM.

ALTER TABLE solicitudes_ayuda
  ADD COLUMN client_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN motivo_cancelacion VARCHAR(1200) NULL,
  ADD COLUMN completada_en DATETIME NULL,
  ADD UNIQUE KEY uq_solicitud_cliente (solicitante_id, client_request_id),
  ADD CONSTRAINT chk_solicitud_idempotencia CHECK (
    (client_request_id IS NULL AND request_hash IS NULL) OR
    (client_request_id IS NOT NULL AND request_hash IS NOT NULL)
  );

ALTER TABLE ofertas_ayuda
  ADD COLUMN entregada_en DATETIME NULL,
  ADD COLUMN confirmada_en DATETIME NULL,
  ADD COLUMN motivo_cancelacion VARCHAR(1200) NULL,
  ADD CONSTRAINT chk_oferta_confirmacion CHECK (
    confirmada_en IS NULL OR (entregada_en IS NOT NULL AND estado = 'completada')
  );

-- Autor y destinatario se obtienen de solicitud/oferta, sin duplicar identidades.
-- La API solo permite valorar al solicitante, después de confirmar la entrega.
-- Las reseñas históricas de publicaciones se conservan en resenas, sin verificar.
CREATE TABLE resenas_colaboracion (
  resena_colaboracion_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  oferta_id BIGINT UNSIGNED NOT NULL,
  calificacion TINYINT UNSIGNED NOT NULL,
  comentario VARCHAR(1200) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (resena_colaboracion_id),
  UNIQUE KEY uq_resena_colaboracion_oferta (oferta_id),
  CONSTRAINT fk_resena_colaboracion_oferta FOREIGN KEY (oferta_id)
    REFERENCES ofertas_ayuda (oferta_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_resena_colaboracion_calificacion CHECK (calificacion BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- Inventario compartido para donaciones/consumibles. Los préstamos usan colaboraciones.
CREATE TABLE recursos_comunitarios (
  recurso_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  propietario_id BIGINT UNSIGNED NOT NULL,
  ubicacion_id BIGINT UNSIGNED NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  unidad VARCHAR(40) NOT NULL,
  cantidad_total INT UNSIGNED NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (recurso_id),
  KEY ix_recursos_propietario (propietario_id),
  KEY ix_recursos_ubicacion (ubicacion_id),
  CONSTRAINT fk_recursos_propietario FOREIGN KEY (propietario_id)
    REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_recursos_ubicacion FOREIGN KEY (ubicacion_id)
    REFERENCES ubicaciones (ubicacion_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_recursos_cantidad CHECK (cantidad_total > 0)
) ENGINE=InnoDB;

CREATE TABLE reservas_recursos (
  reserva_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recurso_id BIGINT UNSIGNED NOT NULL,
  solicitante_id BIGINT UNSIGNED NOT NULL,
  solicitud_id BIGINT UNSIGNED NULL,
  client_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  cantidad INT UNSIGNED NOT NULL,
  estado ENUM('pendiente','reservada','entregada','cancelada') NOT NULL DEFAULT 'pendiente',
  reservada_en DATETIME NULL,
  entregada_en DATETIME NULL,
  cancelada_en DATETIME NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (reserva_id),
  UNIQUE KEY uq_reserva_cliente (solicitante_id, client_request_id),
  KEY ix_reservas_recurso_estado (recurso_id, estado),
  KEY ix_reservas_solicitud (solicitud_id),
  CONSTRAINT fk_reservas_recurso FOREIGN KEY (recurso_id)
    REFERENCES recursos_comunitarios (recurso_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_reservas_solicitante FOREIGN KEY (solicitante_id)
    REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_reservas_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES solicitudes_ayuda (solicitud_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_reservas_cantidad CHECK (cantidad > 0),
  CONSTRAINT chk_reservas_entrega CHECK (
    estado <> 'entregada' OR (reservada_en IS NOT NULL AND entregada_en IS NOT NULL)
  )
) ENGINE=InnoDB;
