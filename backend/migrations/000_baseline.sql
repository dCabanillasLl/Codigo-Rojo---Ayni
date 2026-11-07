-- AYNI - esquema relacional en español, normalizado a 3FN
-- Compatible con MySQL 8.0.16+ (restricciones CHECK aplicadas).
CREATE DATABASE IF NOT EXISTS ayni
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE ayni;

CREATE TABLE sectores_vecinales (
  sector_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  distrito VARCHAR(100) NOT NULL DEFAULT 'Pueblo Libre',
  ciudad VARCHAR(100) NOT NULL DEFAULT 'Lima',
  codigo_pais CHAR(2) NOT NULL DEFAULT 'PE',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sector_id),
  UNIQUE KEY uq_sector_ubicacion (nombre, distrito, ciudad, codigo_pais)
) ENGINE=InnoDB;

CREATE TABLE ubicaciones (
  ubicacion_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sector_id BIGINT UNSIGNED NOT NULL,
  etiqueta VARCHAR(80) NULL COMMENT 'Casa, negocio, punto de encuentro, etc.',
  direccion VARCHAR(255) NULL,
  latitud DECIMAL(10,7) NULL,
  longitud DECIMAL(10,7) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ubicacion_id),
  KEY ix_ubicaciones_sector (sector_id),
  CONSTRAINT fk_ubicaciones_sector FOREIGN KEY (sector_id)
    REFERENCES sectores_vecinales (sector_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_ubicaciones_latitud CHECK (latitud IS NULL OR latitud BETWEEN -90 AND 90),
  CONSTRAINT chk_ubicaciones_longitud CHECK (longitud IS NULL OR longitud BETWEEN -180 AND 180),
  CONSTRAINT chk_ubicaciones_coordenadas CHECK ((latitud IS NULL) = (longitud IS NULL))
) ENGINE=InnoDB;

CREATE TABLE usuarios (
  usuario_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ubicacion_id BIGINT UNSIGNED NULL,
  nombres VARCHAR(80) NOT NULL,
  apellidos VARCHAR(100) NOT NULL,
  correo VARCHAR(254) NOT NULL,
  telefono VARCHAR(25) NULL,
  hash_contrasena VARCHAR(255) NOT NULL,
  estado_cuenta ENUM('activo','suspendido','eliminado') NOT NULL DEFAULT 'activo',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id),
  UNIQUE KEY uq_usuarios_correo (correo),
  UNIQUE KEY uq_usuarios_telefono (telefono),
  KEY ix_usuarios_ubicacion (ubicacion_id),
  CONSTRAINT fk_usuarios_ubicacion FOREIGN KEY (ubicacion_id)
    REFERENCES ubicaciones (ubicacion_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE categorias_publicacion (
  categoria_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(80) NOT NULL,
  descripcion VARCHAR(255) NULL,
  PRIMARY KEY (categoria_id),
  UNIQUE KEY uq_categorias_publicacion_nombre (nombre)
) ENGINE=InnoDB;

CREATE TABLE publicaciones (
  publicacion_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  propietario_id BIGINT UNSIGNED NOT NULL,
  ubicacion_id BIGINT UNSIGNED NOT NULL,
  categoria_id SMALLINT UNSIGNED NOT NULL,
  tipo ENUM('producto','servicio') NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  descripcion TEXT NULL,
  modalidad_precio ENUM('gratis','fijo','desde','cotizar') NOT NULL DEFAULT 'cotizar',
  precio DECIMAL(10,2) NULL,
  moneda CHAR(3) NOT NULL DEFAULT 'PEN',
  estado ENUM('borrador','publicada','pausada','archivada') NOT NULL DEFAULT 'borrador',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (publicacion_id),
  KEY ix_publicaciones_propietario (propietario_id),
  KEY ix_publicaciones_ubicacion (ubicacion_id),
  KEY ix_publicaciones_categoria_tipo_estado (categoria_id, tipo, estado),
  CONSTRAINT fk_publicaciones_propietario FOREIGN KEY (propietario_id)
    REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_publicaciones_ubicacion FOREIGN KEY (ubicacion_id)
    REFERENCES ubicaciones (ubicacion_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_publicaciones_categoria FOREIGN KEY (categoria_id)
    REFERENCES categorias_publicacion (categoria_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_publicaciones_precio CHECK (precio IS NULL OR precio >= 0),
  CONSTRAINT chk_publicaciones_modalidad_precio CHECK (
    (modalidad_precio IN ('gratis','cotizar') AND precio IS NULL) OR
    (modalidad_precio IN ('fijo','desde') AND precio IS NOT NULL)
  )
) ENGINE=InnoDB;

CREATE TABLE resenas (
  resena_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  publicacion_id BIGINT UNSIGNED NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  calificacion TINYINT UNSIGNED NOT NULL,
  comentario VARCHAR(1200) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (resena_id),
  UNIQUE KEY uq_resena_usuario_publicacion (publicacion_id, usuario_id),
  KEY ix_resenas_usuario (usuario_id),
  CONSTRAINT fk_resenas_publicacion FOREIGN KEY (publicacion_id)
    REFERENCES publicaciones (publicacion_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_resenas_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_resenas_calificacion CHECK (calificacion BETWEEN 1 AND 5)
) ENGINE=InnoDB;

CREATE TABLE categorias_ayuda (
  categoria_ayuda_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(80) NOT NULL,
  descripcion VARCHAR(255) NULL,
  PRIMARY KEY (categoria_ayuda_id),
  UNIQUE KEY uq_categorias_ayuda_nombre (nombre)
) ENGINE=InnoDB;

CREATE TABLE solicitudes_ayuda (
  solicitud_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  solicitante_id BIGINT UNSIGNED NOT NULL,
  categoria_ayuda_id SMALLINT UNSIGNED NOT NULL,
  ubicacion_id BIGINT UNSIGNED NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  descripcion TEXT NOT NULL,
  urgencia ENUM('normal','urgente') NOT NULL DEFAULT 'normal',
  estado ENUM('abierta','en_curso','completada','cancelada','vencida') NOT NULL DEFAULT 'abierta',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  vence_en DATETIME NULL,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (solicitud_id),
  KEY ix_solicitudes_estado_categoria_fecha (estado, categoria_ayuda_id, creado_en),
  KEY ix_solicitudes_solicitante (solicitante_id),
  KEY ix_solicitudes_ubicacion (ubicacion_id),
  CONSTRAINT fk_solicitudes_solicitante FOREIGN KEY (solicitante_id)
    REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_solicitudes_categoria FOREIGN KEY (categoria_ayuda_id)
    REFERENCES categorias_ayuda (categoria_ayuda_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_solicitudes_ubicacion FOREIGN KEY (ubicacion_id)
    REFERENCES ubicaciones (ubicacion_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE ofertas_ayuda (
  oferta_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  solicitud_id BIGINT UNSIGNED NOT NULL,
  voluntario_id BIGINT UNSIGNED NOT NULL,
  mensaje VARCHAR(1200) NULL,
  estado ENUM('pendiente','aceptada','rechazada','retirada','completada') NOT NULL DEFAULT 'pendiente',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (oferta_id),
  UNIQUE KEY uq_oferta_voluntario_solicitud (solicitud_id, voluntario_id),
  KEY ix_ofertas_voluntario (voluntario_id),
  CONSTRAINT fk_ofertas_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES solicitudes_ayuda (solicitud_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_ofertas_voluntario FOREIGN KEY (voluntario_id)
    REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE categorias_avisos (
  categoria_aviso_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(80) NOT NULL,
  descripcion VARCHAR(255) NULL,
  PRIMARY KEY (categoria_aviso_id),
  UNIQUE KEY uq_categorias_avisos_nombre (nombre)
) ENGINE=InnoDB;

CREATE TABLE avisos (
  aviso_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  autor_id BIGINT UNSIGNED NOT NULL,
  categoria_aviso_id SMALLINT UNSIGNED NOT NULL,
  ubicacion_id BIGINT UNSIGNED NOT NULL,
  titulo VARCHAR(180) NOT NULL,
  contenido TEXT NOT NULL,
  estado ENUM('borrador','publicado','cancelado','vencido') NOT NULL DEFAULT 'borrador',
  fecha_evento DATETIME NULL,
  vence_en DATETIME NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (aviso_id),
  KEY ix_avisos_estado_categoria_fecha (estado, categoria_aviso_id, creado_en),
  KEY ix_avisos_autor (autor_id),
  KEY ix_avisos_ubicacion (ubicacion_id),
  CONSTRAINT fk_avisos_autor FOREIGN KEY (autor_id)
    REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_avisos_categoria FOREIGN KEY (categoria_aviso_id)
    REFERENCES categorias_avisos (categoria_aviso_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_avisos_ubicacion FOREIGN KEY (ubicacion_id)
    REFERENCES ubicaciones (ubicacion_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- El promedio y el total de reseñas se calculan desde resenas;
-- no se duplican en publicaciones.
