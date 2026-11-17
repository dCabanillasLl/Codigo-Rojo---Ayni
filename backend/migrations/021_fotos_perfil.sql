-- Foto opcional del perfil. Las cuentas existentes conservan sus datos y quedan sin foto.
-- Se almacena el JPEG normalizado sin metadatos, igual que las fotos de publicaciones.
ALTER TABLE usuarios
  ADD COLUMN foto MEDIUMBLOB NULL,
  ADD COLUMN foto_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD CONSTRAINT chk_usuarios_foto CHECK (
    (foto IS NULL AND foto_hash IS NULL) OR
    (foto IS NOT NULL AND foto_hash IS NOT NULL)
  );
