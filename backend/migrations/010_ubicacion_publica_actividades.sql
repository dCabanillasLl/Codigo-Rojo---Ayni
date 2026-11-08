-- Solo los lugares elegidos explícitamente para una actividad son públicos.
-- Los avisos anteriores conservan privada cualquier ubicación heredada del perfil.
ALTER TABLE avisos
  ADD COLUMN ubicacion_publica TINYINT(1) NOT NULL DEFAULT 0,
  ADD CONSTRAINT chk_aviso_ubicacion_publica CHECK (ubicacion_publica IN (0, 1));
