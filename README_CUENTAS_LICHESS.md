# Cuentas y perfil de Lichess

Esta versión añade el concepto de cuenta privada del alumno y campos opcionales para su usuario/enlace de Lichess.

Para activarlo:
1. En Supabase, ejecuta `supabase/profiles_lichess.sql`.
2. Configura Supabase Auth (correo + contraseña).
3. Mantén la clave Publishable/anon en el frontend; nunca publiques `service_role`.
4. Conecta el formulario de inicio de sesión y el guardado del perfil a Supabase Auth/REST.
5. La biblioteca debe comprobar la sesión y la suscripción antes de generar enlaces de descarga.

El nombre de usuario de Lichess es un dato opcional del perfil y no es una credencial de acceso.
