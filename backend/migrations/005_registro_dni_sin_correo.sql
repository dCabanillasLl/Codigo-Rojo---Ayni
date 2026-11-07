-- Registration is DNI-first. Email remains optional for legacy accounts.
ALTER TABLE usuarios
  MODIFY COLUMN correo VARCHAR(254) NULL;

-- Internal catch-all zone for new registrations when the user does not select a sector.
-- The address and coordinates remain private; public listings show only approximate distance.
INSERT IGNORE INTO sectores_vecinales (nombre, distrito, ciudad, codigo_pais)
VALUES ('Pueblo Libre', 'Pueblo Libre', 'Lima', 'PE');
