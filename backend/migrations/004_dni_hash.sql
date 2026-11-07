-- Store only a keyed one-way fingerprint; never persist the raw DNI.
ALTER TABLE usuarios
  ADD COLUMN dni_hash CHAR(64) NULL,
  ADD UNIQUE KEY uq_usuarios_dni_hash (dni_hash);
