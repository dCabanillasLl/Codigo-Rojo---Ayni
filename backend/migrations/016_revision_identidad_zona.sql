-- Registro de quién revisó cada estado. Los IDs del auditor se guardan en una
-- bitácora separada para conservar el historial aunque cambie el revisor actual.
ALTER TABLE verificaciones_identidad
  ADD COLUMN responsable_id BIGINT UNSIGNED NULL AFTER metodo,
  ADD KEY ix_verificacion_identidad_responsable (responsable_id),
  ADD CONSTRAINT fk_verificacion_identidad_responsable FOREIGN KEY (responsable_id)
    REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE pertenencias_zona
  ADD COLUMN responsable_id BIGINT UNSIGNED NULL AFTER metodo,
  ADD KEY ix_pertenencia_responsable (responsable_id),
  ADD CONSTRAINT fk_pertenencia_responsable FOREIGN KEY (responsable_id)
    REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE SET NULL;

-- La bitácora guarda únicamente IDs internos, estados y un motivo breve; nunca DNI,
-- domicilio, coordenadas ni imágenes/documentos de respaldo.
CREATE TABLE auditoria_verificaciones (
  auditoria_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo ENUM('IDENTIDAD','ZONA') NOT NULL,
  usuario_afectado_id BIGINT UNSIGNED NOT NULL,
  sector_id BIGINT UNSIGNED NULL,
  actor_id BIGINT UNSIGNED NOT NULL,
  estado_anterior ENUM('PENDIENTE','VERIFICADA','RECHAZADA','REVOCADA') NULL,
  estado_nuevo ENUM('PENDIENTE','VERIFICADA','RECHAZADA','REVOCADA') NOT NULL,
  metodo VARCHAR(80) NOT NULL,
  motivo VARCHAR(500) NULL,
  creado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (auditoria_id),
  KEY ix_auditoria_verificacion_usuario (usuario_afectado_id, creado_en),
  KEY ix_auditoria_verificacion_actor (actor_id, creado_en),
  KEY ix_auditoria_verificacion_zona (sector_id, creado_en),
  CONSTRAINT chk_auditoria_verificacion_zona CHECK (
    (tipo = 'IDENTIDAD' AND sector_id IS NULL) OR
    (tipo = 'ZONA' AND sector_id IS NOT NULL)
  )
) ENGINE=InnoDB;
