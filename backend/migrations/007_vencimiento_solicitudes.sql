-- Añade una caducidad a pedidos históricos que no tenían fecha límite.
-- Los pedidos urgentes duran 24 h; favores, 72 h; el resto, 7 días.
UPDATE solicitudes_ayuda s
JOIN categorias_ayuda c ON c.categoria_ayuda_id = s.categoria_ayuda_id
SET s.vence_en = CASE
  WHEN LOWER(c.nombre) LIKE '%urgent%' THEN DATE_ADD(s.creado_en, INTERVAL 24 HOUR)
  WHEN LOWER(c.nombre) LIKE '%favor%' THEN DATE_ADD(s.creado_en, INTERVAL 72 HOUR)
  ELSE DATE_ADD(s.creado_en, INTERVAL 168 HOUR)
END
WHERE s.vence_en IS NULL;

-- Cierra y retira del flujo público los pedidos abiertos cuyo plazo ya terminó.
UPDATE solicitudes_ayuda
SET estado = 'vencida'
WHERE estado = 'abierta' AND vence_en <= UTC_TIMESTAMP();

UPDATE ofertas_ayuda o
JOIN solicitudes_ayuda s ON s.solicitud_id = o.solicitud_id
SET o.estado = 'rechazada', o.motivo_cancelacion = 'El pedido venció antes de aceptar la propuesta.'
WHERE s.estado = 'vencida' AND o.estado = 'pendiente';
