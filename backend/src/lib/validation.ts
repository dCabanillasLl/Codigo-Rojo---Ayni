import { z } from "zod";

export const idSchema = z.string().regex(/^[1-9]\d{0,19}$/, "Identificador inválido");
export const locationSchema = z.object({
  latitud: z.number().finite().min(-90).max(90),
  longitud: z.number().finite().min(-180).max(180),
  direccion: z.string().trim().max(255).optional(),
}).strict();
export const passwordSchema = z.string().min(8, "Usa al menos 8 caracteres").max(72)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "La contraseña excede los 72 bytes permitidos");
export const phoneSchema = z.string().trim()
  .regex(/^(?:\+?51)?9[0-9]{8}$/, "Ingresa un celular peruano de 9 dígitos que empiece con 9; el prefijo es +51.")
  .transform(value => `+51${value.slice(-9)}`);
export const registerSchema = z.object({
  nombres: z.string().trim().min(2).max(80),
  apellidos: z.string().trim().min(2).max(100),
  correo: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).nullable().optional(),
  contrasena: passwordSchema,
  telefono: phoneSchema.nullable().optional(),
  direccion: z.string().trim().min(3).max(255),
  sectorId: idSchema.optional(),
  latitud: z.number().finite().min(-90).max(90).optional(),
  longitud: z.number().finite().min(-180).max(180).optional(),
  dni: z.string().regex(/^\d{8}$/),
  consentimientoDni: z.literal(true),
  dniProof: z.string().min(20).max(4096),
}).strict()
  .refine((value) => (value.latitud === undefined) === (value.longitud === undefined), { message: "Proporciona latitud y longitud juntas" });

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
