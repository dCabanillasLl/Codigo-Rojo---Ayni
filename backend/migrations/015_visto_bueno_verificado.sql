-- Persistencia para recomendaciones de productos y servicios respaldadas por experiencias.
-- Las relaciones históricas se conservan como pendientes/no verificadas; no se almacenan DNI, documentos ni domicilios.

CREATE TABLE verificaciones_identidad (
  verificacion_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  estado ENUM('PENDIENTE','VERIFICADA','RECHAZADA','REVOCADA') NOT NULL DEFAULT 'PENDIENTE',
  metodo VARCHAR(80) NOT NULL,
  verificada_en DATETIME(3) NULL,
  revocada_en DATETIME(3) NULL,
  creado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (verificacion_id),
  UNIQUE KEY uq_verificacion_identidad_usuario (usuario_id),
  KEY ix_verificacion_identidad_estado_fecha (estado, verificada_en),
  CONSTRAINT fk_verificacion_identidad_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_verificacion_identidad_fechas CHECK (
    (estado = 'VERIFICADA' AND verificada_en IS NOT NULL AND revocada_en IS NULL) OR
    (estado = 'REVOCADA' AND verificada_en IS NOT NULL AND revocada_en IS NOT NULL AND revocada_en >= verificada_en) OR
    (estado IN ('PENDIENTE','RECHAZADA') AND verificada_en IS NULL AND revocada_en IS NULL)
  )
) ENGINE=InnoDB;

-- La pertenencia histórica del perfil solo demuestra una zona declarada, no residencia verificada.
CREATE TABLE pertenencias_zona (
  pertenencia_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  sector_id BIGINT UNSIGNED NOT NULL,
  metodo VARCHAR(80) NOT NULL DEFAULT 'DECLARADA_EN_PERFIL',
  estado ENUM('PENDIENTE','VERIFICADA','RECHAZADA','REVOCADA') NOT NULL DEFAULT 'PENDIENTE',
  solicitada_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  verificada_en DATETIME(3) NULL,
  vence_en DATETIME(3) NULL,
  revocada_en DATETIME(3) NULL,
  actualizado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (pertenencia_id),
  UNIQUE KEY uq_pertenencia_usuario_sector (usuario_id, sector_id),
  KEY ix_pertenencia_usuario_estado (usuario_id, estado, vence_en),
  KEY ix_pertenencia_sector_estado (sector_id, estado),
  CONSTRAINT fk_pertenencia_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_pertenencia_sector FOREIGN KEY (sector_id)
    REFERENCES sectores_vecinales (sector_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_pertenencia_fechas CHECK (
    (estado = 'PENDIENTE' AND verificada_en IS NULL AND revocada_en IS NULL) OR
    (estado = 'VERIFICADA' AND verificada_en IS NOT NULL AND revocada_en IS NULL AND (vence_en IS NULL OR vence_en > verificada_en)) OR
    (estado = 'RECHAZADA' AND revocada_en IS NULL) OR
    (estado = 'REVOCADA' AND verificada_en IS NOT NULL AND revocada_en IS NOT NULL AND revocada_en >= verificada_en)
  )
) ENGINE=InnoDB;

-- No inferimos verificación de identidad desde el DNI hash histórico ni verificamos automáticamente
-- el sector declarado en el perfil: la información anterior queda pendiente de comprobación.
INSERT INTO verificaciones_identidad (usuario_id, estado, metodo)
SELECT usuario_id, 'PENDIENTE', 'SIN_HISTORIAL_DE_VALIDACION' FROM usuarios;

INSERT INTO pertenencias_zona (usuario_id, sector_id, metodo, estado)
SELECT u.usuario_id, l.sector_id, 'DECLARADA_EN_PERFIL', 'PENDIENTE'
FROM usuarios u
JOIN ubicaciones l ON l.ubicacion_id = u.ubicacion_id;

-- La clave compuesta permite que una interacción declare de forma verificable al dueño real.
ALTER TABLE publicaciones
  ADD UNIQUE KEY uq_publicacion_propietario (publicacion_id, propietario_id);

CREATE TABLE interacciones_publicacion (
  interaccion_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  publicacion_id BIGINT UNSIGNED NOT NULL,
  solicitante_id BIGINT UNSIGNED NOT NULL,
  propietario_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('CONSULTA','COMPRA','CONTRATACION','OTRO') NOT NULL,
  estado ENUM('PENDIENTE','CONFIRMADA','RECHAZADA','CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
  solicitante_confirmo_en DATETIME(3) NULL,
  propietario_confirmo_en DATETIME(3) NULL,
  confirmada_en DATETIME(3) NULL,
  creado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (interaccion_id),
  UNIQUE KEY uq_interaccion_autor_publicacion (interaccion_id, publicacion_id, solicitante_id),
  KEY ix_interaccion_publicacion_estado (publicacion_id, estado, creado_en),
  KEY ix_interaccion_solicitante_estado (solicitante_id, estado, creado_en),
  KEY ix_interaccion_propietario_estado (propietario_id, estado, creado_en),
  CONSTRAINT fk_interaccion_publicacion_propietario FOREIGN KEY (publicacion_id, propietario_id)
    REFERENCES publicaciones (publicacion_id, propietario_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_interaccion_solicitante FOREIGN KEY (solicitante_id)
    REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_interaccion_confirmacion CHECK (
    (estado = 'CONFIRMADA' AND solicitante_confirmo_en IS NOT NULL AND propietario_confirmo_en IS NOT NULL AND confirmada_en IS NOT NULL) OR
    (estado <> 'CONFIRMADA' AND confirmada_en IS NULL AND (solicitante_confirmo_en IS NULL OR propietario_confirmo_en IS NULL))
  )
) ENGINE=InnoDB;

-- Las reseñas sin una interacción válida permanecen explícitamente no verificadas.
ALTER TABLE resenas
  ADD COLUMN interaccion_id BIGINT UNSIGNED NULL AFTER usuario_id,
  ADD COLUMN estado_verificacion ENUM('NO_VERIFICADA','VERIFICADA') NOT NULL DEFAULT 'NO_VERIFICADA' AFTER comentario,
  ADD COLUMN verificada_en DATETIME(3) NULL AFTER estado_verificacion,
  ADD UNIQUE KEY uq_resena_interaccion (interaccion_id),
  ADD KEY ix_resena_publicacion_verificacion_fecha (publicacion_id, estado_verificacion, creado_en),
  ADD CONSTRAINT fk_resena_interaccion_autor_publicacion FOREIGN KEY (interaccion_id, publicacion_id, usuario_id)
    REFERENCES interacciones_publicacion (interaccion_id, publicacion_id, solicitante_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD KEY ix_resena_interaccion_estado (interaccion_id, estado_verificacion);

CREATE TRIGGER bi_interacciones_publicacion_no_autorreferencia
BEFORE INSERT ON interacciones_publicacion FOR EACH ROW
BEGIN
  IF NEW.solicitante_id = NEW.propietario_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Una persona no puede iniciar una interacción con su propia publicación.';
  END IF;
END;

CREATE TRIGGER bu_interacciones_publicacion_no_autorreferencia
BEFORE UPDATE ON interacciones_publicacion FOR EACH ROW
BEGIN
  IF NEW.solicitante_id = NEW.propietario_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Una persona no puede ser solicitante y propietaria de la misma interacción.';
  END IF;
END;

CREATE TRIGGER bi_resenas_integridad_publicacion
BEFORE INSERT ON resenas FOR EACH ROW
BEGIN
  DECLARE v_propietario_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_interaccion_valida INT DEFAULT 0;
  DECLARE v_interaccion_confirmada INT DEFAULT 0;

  SELECT propietario_id INTO v_propietario_id
    FROM publicaciones WHERE publicacion_id = NEW.publicacion_id;
  IF v_propietario_id IS NOT NULL AND v_propietario_id = NEW.usuario_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El propietario no puede reseñar su propia publicación.';
  END IF;

  IF NEW.interaccion_id IS NULL THEN
    SET NEW.estado_verificacion = 'NO_VERIFICADA';
    SET NEW.verificada_en = NULL;
  ELSE
    SELECT COUNT(*) INTO v_interaccion_valida
      FROM interacciones_publicacion
      WHERE interaccion_id = NEW.interaccion_id
        AND publicacion_id = NEW.publicacion_id
        AND solicitante_id = NEW.usuario_id;
    IF v_interaccion_valida = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La interacción no corresponde al autor y a la publicación.';
    END IF;

    SELECT COUNT(*) INTO v_interaccion_confirmada
      FROM interacciones_publicacion
      WHERE interaccion_id = NEW.interaccion_id
        AND estado = 'CONFIRMADA'
        AND solicitante_confirmo_en IS NOT NULL
        AND propietario_confirmo_en IS NOT NULL
        AND confirmada_en IS NOT NULL;
    IF v_interaccion_confirmada = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Solo una interacción confirmada puede verificar la reseña.';
    END IF;
    SET NEW.estado_verificacion = 'VERIFICADA';
    SET NEW.verificada_en = UTC_TIMESTAMP(3);
  END IF;
END;

CREATE TRIGGER bu_resenas_integridad_publicacion
BEFORE UPDATE ON resenas FOR EACH ROW
BEGIN
  DECLARE v_propietario_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_interaccion_valida INT DEFAULT 0;
  DECLARE v_interaccion_confirmada INT DEFAULT 0;

  SELECT propietario_id INTO v_propietario_id
    FROM publicaciones WHERE publicacion_id = NEW.publicacion_id;
  IF v_propietario_id IS NOT NULL AND v_propietario_id = NEW.usuario_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El propietario no puede reseñar su propia publicación.';
  END IF;

  IF NEW.interaccion_id IS NULL THEN
    SET NEW.estado_verificacion = 'NO_VERIFICADA';
    SET NEW.verificada_en = NULL;
  ELSE
    SELECT COUNT(*) INTO v_interaccion_valida
      FROM interacciones_publicacion
      WHERE interaccion_id = NEW.interaccion_id
        AND publicacion_id = NEW.publicacion_id
        AND solicitante_id = NEW.usuario_id;
    IF v_interaccion_valida = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La interacción no corresponde al autor y a la publicación.';
    END IF;

    SELECT COUNT(*) INTO v_interaccion_confirmada
      FROM interacciones_publicacion
      WHERE interaccion_id = NEW.interaccion_id
        AND estado = 'CONFIRMADA'
        AND solicitante_confirmo_en IS NOT NULL
        AND propietario_confirmo_en IS NOT NULL
        AND confirmada_en IS NOT NULL;
    IF v_interaccion_confirmada = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Solo una interacción confirmada puede verificar la reseña.';
    END IF;
    SET NEW.estado_verificacion = 'VERIFICADA';
    SET NEW.verificada_en = COALESCE(OLD.verificada_en, UTC_TIMESTAMP(3));
  END IF;
END;

CREATE TRIGGER bu_interacciones_publicacion_resenada
BEFORE UPDATE ON interacciones_publicacion FOR EACH ROW
BEGIN
  DECLARE v_resenas INT DEFAULT 0;
  IF OLD.estado = 'CONFIRMADA' AND NEW.estado <> 'CONFIRMADA' THEN
    SELECT COUNT(*) INTO v_resenas FROM resenas
      WHERE interaccion_id = OLD.interaccion_id AND estado_verificacion = 'VERIFICADA';
    IF v_resenas > 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Una interacción que verifica reseñas no puede dejar de estar confirmada.';
    END IF;
  END IF;
END;
