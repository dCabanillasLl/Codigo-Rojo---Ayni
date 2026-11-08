CREATE TABLE notificaciones_interacciones (
  notificacion_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  solicitud_id BIGINT UNSIGNED NOT NULL,
  oferta_id BIGINT UNSIGNED NOT NULL,
  tipo VARCHAR(40) CHARACTER SET ascii NOT NULL,
  texto VARCHAR(500) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  leida_en TIMESTAMP NULL,
  PRIMARY KEY (notificacion_id),
  UNIQUE KEY uq_notificacion_interaccion (usuario_id, oferta_id, tipo),
  KEY ix_notificacion_interaccion_usuario (usuario_id, creado_en),
  CONSTRAINT fk_notificacion_interaccion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
  CONSTRAINT fk_notificacion_interaccion_solicitud FOREIGN KEY (solicitud_id) REFERENCES solicitudes_ayuda(solicitud_id) ON DELETE CASCADE,
  CONSTRAINT fk_notificacion_interaccion_oferta FOREIGN KEY (oferta_id) REFERENCES ofertas_ayuda(oferta_id) ON DELETE CASCADE
) ENGINE=InnoDB;
