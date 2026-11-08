ALTER TABLE avisos
  ADD COLUMN revision_evento INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN motivo_cambio VARCHAR(500) NULL;

CREATE TABLE asistencias_avisos (
  aviso_id BIGINT UNSIGNED NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  confirmada TINYINT(1) NOT NULL DEFAULT 1,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (aviso_id, usuario_id),
  KEY ix_asistencia_usuario (usuario_id, confirmada, aviso_id),
  CONSTRAINT fk_asistencia_aviso FOREIGN KEY (aviso_id) REFERENCES avisos(aviso_id) ON DELETE CASCADE,
  CONSTRAINT fk_asistencia_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
  CONSTRAINT chk_asistencia_confirmada CHECK (confirmada IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE notificaciones_avisos (
  notificacion_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  aviso_id BIGINT UNSIGNED NOT NULL,
  revision_evento INT UNSIGNED NOT NULL,
  texto VARCHAR(1600) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  leida_en TIMESTAMP NULL,
  PRIMARY KEY (notificacion_id),
  UNIQUE KEY uq_notificacion_cambio (aviso_id, revision_evento, usuario_id),
  KEY ix_notificaciones_usuario (usuario_id, creado_en),
  CONSTRAINT fk_notificacion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
  CONSTRAINT fk_notificacion_aviso FOREIGN KEY (aviso_id) REFERENCES avisos(aviso_id) ON DELETE CASCADE
) ENGINE=InnoDB;
