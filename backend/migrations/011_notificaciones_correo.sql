-- Preferencia explícita para recibir avisos de colaboraciones por correo.
ALTER TABLE usuarios
  ADD COLUMN notificaciones_correo TINYINT(1) NOT NULL DEFAULT 0 AFTER correo;
