# Configurar Gemini en AYNI (Windows)

Gemini se usa solamente para las preguntas abiertas del guía. Las acciones guiadas y el recorrido visual siguen funcionando sin IA. El navegador llama al backend AYNI; el backend llama a Google. La clave nunca debe ir en React ni en una variable `VITE_*`.

## 1. Crear una clave de Gemini

1. Inicia sesión con la cuenta Google del equipo en [Google AI Studio – API keys](https://aistudio.google.com/app/apikey).
2. Crea o selecciona un proyecto y genera una clave de API.
3. Conserva la clave en privado. No la pegues en el chat, GitHub, capturas ni archivos del frontend.
4. Si el panel ofrece crear una clave de autorización o restringir la clave, úsala y limita el uso a Gemini API. En noviembre de 2026 Google recomienda las claves de autorización; las claves estándar sin restricciones ya no son aceptadas. Consulta la [guía oficial de claves](https://ai.google.dev/gemini-api/docs/api-key).
5. Revisa el panel **Usage** de AI Studio para controlar cuota y consumo. Las cuotas disponibles dependen del proyecto, modelo y nivel de acceso; no habilites facturación sin que el equipo lo decida.

## 2. Guardar la clave en el backend

En PowerShell:

```powershell
cd C:\Users\DELL\Codigo-Rojo---Ayni\backend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Si `backend/.env` ya existe, no lo reemplaces: abre ese archivo y agrega o actualiza estas líneas:

```ini
GEMINI_API_KEY=pega_aqui_tu_clave
GEMINI_MODEL=gemini-3.8-flash
```

No uses comillas ni espacios alrededor del `=`. No compartas el archivo `.env`.

## 3. Reiniciar el backend

Si ya está corriendo, deténlo con `Ctrl+C`. Luego, desde la carpeta `backend`, ejecuta:

```powershell
npm run dev
```

Mantén el frontend Vite corriendo en su otra terminal. No necesitas instalar un paquete adicional: el backend usa `fetch` de Node para llamar a Gemini.

## 4. Probar desde AYNI

Abre el guía y escribe una pregunta abierta, por ejemplo: **“¿Qué hago si un vecino ofrece ayuda para mi pedido?”**. Las sugerencias rápidas y el recorrido visual siguen siendo locales; una pregunta abierta consulta Gemini.

## Si no responde

- **`GEMINI_NOT_CONFIGURED`**: la clave falta en `backend/.env` o no reiniciaste el backend.
- **`GEMINI_AUTH_FAILED`**: revisa que la clave sea válida y esté habilitada para Gemini API.
- **`GEMINI_RATE_LIMITED`** o respuesta 429: revisa la cuota/uso en AI Studio y espera a que se restablezca el límite.
- **No conecta**: confirma que el backend tenga acceso a internet y revisa su terminal.

Las preguntas abiertas se envían a Google para generar respuestas y no se guardan en AYNI. El guía advierte que no se envíen DNI, contraseñas ni direcciones. Gemini es solo el guía: las reglas de seguridad y validación de AYNI deben seguir aplicándose en el backend.
