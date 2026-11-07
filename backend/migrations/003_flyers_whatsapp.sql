-- Referencia HTTPS de flyer y consentimiento explícito para mostrar teléfono en publicaciones.
ALTER TABLE avisos
  ADD COLUMN imagen_url VARCHAR(2048) NULL;

ALTER TABLE usuarios
  ADD COLUMN telefono_publico TINYINT(1) NOT NULL DEFAULT 0,
  ADD CONSTRAINT chk_usuarios_telefono_publico CHECK (
    telefono_publico IN (0, 1) AND (telefono_publico = 0 OR telefono IS NOT NULL)
  );
