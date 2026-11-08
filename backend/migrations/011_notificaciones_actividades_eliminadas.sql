-- Conserva las notificaciones pendientes aunque el organizador elimine el evento.
ALTER TABLE notificaciones_avisos
  DROP FOREIGN KEY fk_notificacion_aviso,
  MODIFY COLUMN aviso_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_notificacion_aviso_conservada FOREIGN KEY (aviso_id)
    REFERENCES avisos(aviso_id) ON DELETE SET NULL;
