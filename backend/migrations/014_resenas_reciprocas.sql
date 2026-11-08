-- Permite que solicitante y colaborador se valoren por separado tras confirmar el aporte.
-- Las reseñas existentes se conservan como valoraciones del solicitante al colaborador.
ALTER TABLE resenas_colaboracion
  ADD COLUMN autor_id BIGINT UNSIGNED NULL AFTER oferta_id,
  ADD COLUMN evaluado_id BIGINT UNSIGNED NULL AFTER autor_id;

UPDATE resenas_colaboracion r
JOIN ofertas_ayuda o ON o.oferta_id = r.oferta_id
JOIN solicitudes_ayuda s ON s.solicitud_id = o.solicitud_id
SET r.autor_id = s.solicitante_id, r.evaluado_id = o.voluntario_id
WHERE r.autor_id IS NULL OR r.evaluado_id IS NULL;

ALTER TABLE resenas_colaboracion
  MODIFY COLUMN autor_id BIGINT UNSIGNED NOT NULL,
  MODIFY COLUMN evaluado_id BIGINT UNSIGNED NOT NULL,
  DROP INDEX uq_resena_colaboracion_oferta,
  ADD UNIQUE KEY uq_resena_colaboracion_autor (oferta_id, autor_id),
  ADD KEY ix_resena_colaboracion_evaluado (evaluado_id, creado_en),
  ADD CONSTRAINT fk_resena_colaboracion_autor FOREIGN KEY (autor_id)
    REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_resena_colaboracion_evaluado FOREIGN KEY (evaluado_id)
    REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE RESTRICT;
