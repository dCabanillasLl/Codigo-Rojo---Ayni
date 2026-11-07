import { z } from "zod";

export const idSchema = z.string().regex(/^[1-9]\d{0,19}$/, "Identificador inválido");
export const passwordSchema = z.string().min(8, "Usa al menos 8 caracteres").max(72)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "La contraseña excede los 72 bytes permitidos");
export const phoneSchema = z.string().trim().regex(/^\+?[0-9]{8,15}$/, "Usa entre 8 y 15 dígitos, con prefijo internacional opcional");
export const registerSchema = z.object({
  nombres: z.string().trim().min(2).max(80),
  apellidos: z.string().trim().min(2).max(100),
  correo: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  contrasena: passwordSchema,
  telefono: phoneSchema.nullable().optional(),
  sectorId: idSchema,
  latitud: z.number().finite().min(-90).max(90).optional(),
  longitud: z.number().finite().min(-180).max(180).optional(),
}).strict().refine((value) => (value.latitud === undefined) === (value.longitud === undefined), { message: "Proporciona latitud y longitud juntas" });

export const listSchema = z.object({
  q: z.string().trim().max(160).optional(),
  sectorId: idSchema.optional(),
  categoriaId: idSchema.optional(),
  tipo: z.enum(["producto", "servicio"]).optional(),
  mios: z.enum(["0", "1"]).optional(),
  latitud: z.coerce.number().finite().min(-90).max(90).optional(),
  longitud: z.coerce.number().finite().min(-180).max(180).optional(),
  radio: z.coerce.number().int().min(1000).max(2000).default(1000),
}).refine((value) => (value.latitud === undefined) === (value.longitud === undefined), {
  message: "Proporciona latitud y longitud juntas",
});
export type ListFilters = z.infer<typeof listSchema>;
