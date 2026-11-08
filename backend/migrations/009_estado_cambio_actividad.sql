-- Distingue una postergación de otras actualizaciones, sin cambiar la publicación.
ALTER TABLE avisos
  ADD COLUMN ultimo_cambio_evento VARCHAR(20) NULL;
