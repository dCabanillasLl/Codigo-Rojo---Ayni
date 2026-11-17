-- Una foto de perfil opcional por usuario. Las cuentas existentes quedan sin foto.
ALTER TABLE usuarios
  ADD COLUMN foto_perfil MEDIUMBLOB NULL,
  ADD COLUMN foto_perfil_hash CHAR(64) NULL;
