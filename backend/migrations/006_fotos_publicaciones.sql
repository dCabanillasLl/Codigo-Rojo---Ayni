-- Una foto opcional por publicación. Las publicaciones existentes quedan sin foto.
-- Se guarda el JPEG normalizado (máximo 1600 px / 2 MB), no el archivo original.
ALTER TABLE publicaciones
  ADD COLUMN imagen MEDIUMBLOB NULL,
  ADD COLUMN imagen_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD CONSTRAINT chk_publicaciones_imagen CHECK (
    (imagen IS NULL AND imagen_hash IS NULL) OR
    (imagen IS NOT NULL AND imagen_hash IS NOT NULL)
  );
