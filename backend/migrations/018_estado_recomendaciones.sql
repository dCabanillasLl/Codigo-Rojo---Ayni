-- PENDIENTE distingue una experiencia vinculada cuya evidencia aún no satisface
-- identidad, zona y confirmación bilateral. El estado vigente se recalcula en API.
ALTER TABLE resenas
  MODIFY COLUMN estado_verificacion ENUM('NO_VERIFICADA','PENDIENTE','VERIFICADA')
    NOT NULL DEFAULT 'NO_VERIFICADA';

DROP TRIGGER IF EXISTS bi_resenas_integridad_publicacion;
DROP TRIGGER IF EXISTS bu_resenas_integridad_publicacion;
DROP TRIGGER IF EXISTS bu_interacciones_publicacion_resenada;

CREATE TRIGGER bi_resenas_integridad_publicacion
BEFORE INSERT ON resenas FOR EACH ROW
BEGIN
  DECLARE v_propietario_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_sector_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_interaccion INT DEFAULT 0;
  DECLARE v_estado VARCHAR(20) DEFAULT NULL;
  DECLARE v_propietario_interaccion BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_solicitante_confirmo INT DEFAULT 0;
  DECLARE v_propietario_confirmo INT DEFAULT 0;
  DECLARE v_confirmada_en DATETIME(3) DEFAULT NULL;
  DECLARE v_elegible INT DEFAULT 0;

  SELECT p.propietario_id, l.sector_id INTO v_propietario_id, v_sector_id
    FROM publicaciones p JOIN ubicaciones l ON l.ubicacion_id=p.ubicacion_id
    WHERE p.publicacion_id=NEW.publicacion_id;
  IF v_propietario_id IS NOT NULL AND v_propietario_id=NEW.usuario_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='El propietario no puede reseñar su propia publicación.';
  END IF;
  IF NEW.interaccion_id IS NULL THEN
    SET NEW.estado_verificacion='NO_VERIFICADA';
    SET NEW.verificada_en=NULL;
  ELSE
    SELECT COUNT(*), MAX(estado), MAX(propietario_id), MAX(solicitante_confirmo_en IS NOT NULL),
      MAX(propietario_confirmo_en IS NOT NULL), MAX(confirmada_en)
      INTO v_interaccion, v_estado, v_propietario_interaccion, v_solicitante_confirmo, v_propietario_confirmo, v_confirmada_en
      FROM interacciones_publicacion WHERE interaccion_id=NEW.interaccion_id
        AND publicacion_id=NEW.publicacion_id AND solicitante_id=NEW.usuario_id;
    IF v_interaccion=0 OR v_propietario_interaccion<>v_propietario_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La interacción no corresponde al autor, publicación y propietario.';
    END IF;
    IF v_estado IN ('RECHAZADA','CANCELADA') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Una interacción cancelada o rechazada no respalda recomendaciones.';
    END IF;
    IF v_estado='CONFIRMADA' AND v_solicitante_confirmo=1 AND v_propietario_confirmo=1 AND v_confirmada_en IS NOT NULL THEN
      SELECT COUNT(*) INTO v_elegible FROM verificaciones_identidad vi
        JOIN pertenencias_zona pz ON pz.usuario_id=vi.usuario_id
        WHERE vi.usuario_id=NEW.usuario_id AND vi.estado='VERIFICADA' AND vi.verificada_en IS NOT NULL AND vi.revocada_en IS NULL
          AND pz.sector_id=v_sector_id AND pz.estado='VERIFICADA' AND pz.verificada_en IS NOT NULL
          AND pz.revocada_en IS NULL AND (pz.vence_en IS NULL OR pz.vence_en>UTC_TIMESTAMP(3));
      IF v_elegible>0 THEN
        SET NEW.estado_verificacion='VERIFICADA';
        SET NEW.verificada_en=UTC_TIMESTAMP(3);
      ELSE
        SET NEW.estado_verificacion='PENDIENTE';
        SET NEW.verificada_en=NULL;
      END IF;
    ELSE
      SET NEW.estado_verificacion='PENDIENTE';
      SET NEW.verificada_en=NULL;
    END IF;
  END IF;
END;

CREATE TRIGGER bu_resenas_integridad_publicacion
BEFORE UPDATE ON resenas FOR EACH ROW
BEGIN
  DECLARE v_propietario_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_sector_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_interaccion INT DEFAULT 0;
  DECLARE v_estado VARCHAR(20) DEFAULT NULL;
  DECLARE v_propietario_interaccion BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_solicitante_confirmo INT DEFAULT 0;
  DECLARE v_propietario_confirmo INT DEFAULT 0;
  DECLARE v_confirmada_en DATETIME(3) DEFAULT NULL;
  DECLARE v_elegible INT DEFAULT 0;

  SELECT p.propietario_id, l.sector_id INTO v_propietario_id, v_sector_id
    FROM publicaciones p JOIN ubicaciones l ON l.ubicacion_id=p.ubicacion_id
    WHERE p.publicacion_id=NEW.publicacion_id;
  IF v_propietario_id IS NOT NULL AND v_propietario_id=NEW.usuario_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='El propietario no puede reseñar su propia publicación.';
  END IF;
  IF NEW.interaccion_id IS NULL THEN
    SET NEW.estado_verificacion='NO_VERIFICADA';
    SET NEW.verificada_en=NULL;
  ELSE
    SELECT COUNT(*), MAX(estado), MAX(propietario_id), MAX(solicitante_confirmo_en IS NOT NULL),
      MAX(propietario_confirmo_en IS NOT NULL), MAX(confirmada_en)
      INTO v_interaccion, v_estado, v_propietario_interaccion, v_solicitante_confirmo, v_propietario_confirmo, v_confirmada_en
      FROM interacciones_publicacion WHERE interaccion_id=NEW.interaccion_id
        AND publicacion_id=NEW.publicacion_id AND solicitante_id=NEW.usuario_id;
    IF v_interaccion=0 OR v_propietario_interaccion<>v_propietario_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La interacción no corresponde al autor, publicación y propietario.';
    END IF;
    IF v_estado IN ('RECHAZADA','CANCELADA') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Una interacción cancelada o rechazada no respalda recomendaciones.';
    END IF;
    IF v_estado='CONFIRMADA' AND v_solicitante_confirmo=1 AND v_propietario_confirmo=1 AND v_confirmada_en IS NOT NULL THEN
      SELECT COUNT(*) INTO v_elegible FROM verificaciones_identidad vi
        JOIN pertenencias_zona pz ON pz.usuario_id=vi.usuario_id
        WHERE vi.usuario_id=NEW.usuario_id AND vi.estado='VERIFICADA' AND vi.verificada_en IS NOT NULL AND vi.revocada_en IS NULL
          AND pz.sector_id=v_sector_id AND pz.estado='VERIFICADA' AND pz.verificada_en IS NOT NULL
          AND pz.revocada_en IS NULL AND (pz.vence_en IS NULL OR pz.vence_en>UTC_TIMESTAMP(3));
      IF v_elegible>0 THEN
        SET NEW.estado_verificacion='VERIFICADA';
        SET NEW.verificada_en=COALESCE(OLD.verificada_en,UTC_TIMESTAMP(3));
      ELSE
        SET NEW.estado_verificacion='PENDIENTE';
        SET NEW.verificada_en=NULL;
      END IF;
    ELSE
      SET NEW.estado_verificacion='PENDIENTE';
      SET NEW.verificada_en=NULL;
    END IF;
  END IF;
END;
