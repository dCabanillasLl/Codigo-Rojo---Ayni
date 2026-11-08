# Configurar el correo de AYNI con Gmail (sin comprar dominio)

AYNI puede enviar códigos de verificación y avisos usando una cuenta Gmail dedicada. El backend se conecta a Gmail por SMTP seguro. La contraseña normal de Gmail no se usa ni se guarda en el repositorio.

## 1. Crear una contraseña de aplicación

1. Inicia sesión en `ayni.proyectocodigorojo@gmail.com`.
2. Abre la configuración de la Cuenta de Google y entra en **Seguridad**.
3. Activa **Verificación en dos pasos** si todavía está desactivada.
4. En Seguridad, busca **Contraseñas de aplicaciones**. Google solo muestra esta opción cuando la cuenta cumple sus requisitos de seguridad.
5. Crea una contraseña para AYNI y copia la clave de 16 caracteres. No compartas esa clave por chat ni la subas a Git.

## 2. Guardar la configuración local del backend

Abre PowerShell:

```powershell
cd C:\Users\DELL\Codigo-Rojo---Ayni\backend
notepad .env
```

Agrega o actualiza estas variables en `backend/.env`:

```ini
EMAIL_PROVIDER=gmail
GMAIL_USER=ayni.proyectocodigorojo@gmail.com
GMAIL_APP_PASSWORD=PEGA_AQUI_LA_CLAVE_DE_16_CARACTERES
EMAIL_FROM=AYNI <ayni.proyectocodigorojo@gmail.com>
```

En `GMAIL_APP_PASSWORD` pega la contraseña de aplicación, no la contraseña habitual de Google. No uses comillas. No pongas la clave en `src/`, `VITE_*` ni en este documento.

Guarda el archivo, cierra el editor y reinicia el backend:

```powershell
npm run dev
```

Si el backend ya estaba abierto, detenlo con `Ctrl+C` antes de volver a ejecutar el comando.

## 3. Probar

1. Abre AYNI e inicia sesión.
2. En el perfil, guarda el correo de destino.
3. Pulsa **Enviar código de confirmación** una sola vez.
4. Comprueba la bandeja de entrada y correo no deseado.
5. Si falla, revisa el mensaje de la terminal del backend. `EAUTH` suele significar que la cuenta o contraseña de aplicación no fueron aceptadas. Confirma que `GMAIL_USER` y el correo de `EMAIL_FROM` coincidan.

## Límites y seguridad

- Gmail aplica límites diarios y puede bloquear temporalmente envíos que parezcan spam; es una opción para MVP y bajo volumen, no para campañas masivas.
- Usa la cuenta solo para AYNI y limita los reintentos de envío.
- Si cambias la contraseña de la cuenta Google, Google puede revocar sus contraseñas de aplicación; genera otra y actualiza el `.env`.
- El proveedor alternativo Resend sigue disponible con `EMAIL_PROVIDER=resend`, una clave API y un dominio remitente verificado.
