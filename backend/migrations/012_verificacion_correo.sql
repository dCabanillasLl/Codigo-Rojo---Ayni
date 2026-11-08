ALTER TABLE usuarios
  ADD COLUMN correo_verificado TINYINT(1) NOT NULL DEFAULT 0 AFTER correo,
  ADD COLUMN correo_codigo_hash CHAR(64) NULL AFTER correo_verificado,
  ADD COLUMN correo_codigo_vence DATETIME NULL AFTER correo_codigo_hash;
