CREATE TABLE IF NOT EXISTS recuperaciones_contrasena (
  usuario_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  correo VARCHAR(254) NOT NULL,
  codigo_hash CHAR(64) NOT NULL,
  credencial_hash CHAR(64) NOT NULL,
  vence DATETIME NOT NULL,
  solicitado_en DATETIME NOT NULL,
  intentos TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_recuperacion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(usuario_id) ON DELETE CASCADE
) ENGINE=InnoDB;
