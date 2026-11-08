-- Flyer opcional normalizado. Conserva los enlaces externos y avisos existentes.
ALTER TABLE avisos
  ADD COLUMN imagen MEDIUMBLOB NULL,
  ADD COLUMN imagen_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD CONSTRAINT chk_avisos_imagen CHECK (
    (imagen IS NULL AND imagen_hash IS NULL) OR
    (imagen IS NOT NULL AND imagen_hash IS NOT NULL)
  );
