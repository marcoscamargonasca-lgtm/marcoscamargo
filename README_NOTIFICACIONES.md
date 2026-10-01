# Pasillo del Rey — cuentas, biblioteca y avisos de vencimiento

## Qué queda preparado
- Cuentas con Supabase Auth.
- Biblioteca privada con PDFs en Storage privado.
- Descargas mediante enlaces firmados.
- Suscripciones y pagos.
- Registro de padre/madre/apoderado.
- Avisos automáticos 7, 3, 1 y 0 días antes del vencimiento.
- Aviso de vencimiento (-1 día) si la suscripción ya venció.
- Registro de cada aviso para evitar duplicados.
- Correo preparado con Resend.
- WhatsApp preparado para WhatsApp Business Cloud API mediante plantilla aprobada.
- Cron de Supabase para ejecutar el proceso diariamente.

## 1. Ejecutar SQL
En Supabase > SQL Editor:
1. Ejecuta `supabase_schema.sql` si todavía no lo hiciste.
2. Ejecuta `supabase/notifications_migration.sql`.

## 2. Storage
Mantén el bucket `libros` como PRIVADO. Supabase permite descargar archivos privados con autenticación o URLs firmadas con duración limitada. No publiques los PDFs en un bucket público.

## 3. Edge Functions
Despliega:
```bash
supabase functions deploy download-book
supabase functions deploy payment-webhook --no-verify-jwt
supabase functions deploy notify-expirations --no-verify-jwt
```

## 4. Secrets
Configura en Supabase:
```text
SUPABASE_URL=https://sozopfatthuryfxmhiek.supabase.co
SUPABASE_SECRET_KEY=TU_SECRET_KEY
SUPABASE_PUBLISHABLE_KEY=TU_PUBLISHABLE_KEY

# Correo
RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=Pasillo del Rey <tu-correo-verificado@tudominio.com>

# WhatsApp Business Cloud API
WHATSAPP_ACCESS_TOKEN=TU_TOKEN
WHATSAPP_PHONE_NUMBER_ID=TU_PHONE_NUMBER_ID
WHATSAPP_TEMPLATE_NAME=recordatorio_suscripcion
WHATSAPP_TEMPLATE_LANG=es
```

La Secret Key, Resend API key y token de WhatsApp NUNCA deben ir en `index.html` ni en GitHub.

## 5. Plantilla de WhatsApp
Crea/aprueba una plantilla con 3 variables en el cuerpo, por ejemplo:
1. Nombre del alumno
2. Fecha de vencimiento
3. Días restantes

El código envía las variables en ese orden.

## 6. Correo
La función utiliza la API REST de Resend. Primero verifica tu dominio/remitente en Resend y después coloca la API key como secret de Supabase.

## 7. Programar el proceso diario
Supabase Cron puede ejecutar SQL o llamar una Edge Function. Puedes crear un Job desde Dashboard > Integrations > Cron o mediante SQL.

Ejemplo:
```sql
select cron.schedule(
  'pasillo-notificar-vencimientos',
  '10 3 * * *',
  $$
  select net.http_post(
    url := 'https://sozopfatthuryfxmhiek.supabase.co/functions/v1/notify-expirations',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','TU_PUBLISHABLE_KEY'
    ),
    body := jsonb_build_object('source','cron')
  );
  $$
);
```

`10 3 * * *` corresponde a 03:10 UTC. La función compara las fechas usando `America/Lima`, así que no depende de la zona horaria del navegador.

## 8. Flujo
Alumno crea cuenta -> registra apoderado -> pago confirmado -> suscripción activa -> biblioteca habilitada -> Cron revisa diariamente -> aviso 7/3/1/0 días -> renovación -> nueva fecha.

## 9. Verificación de pagos
El QR estático de Yape no genera por sí solo un webhook. Para activar suscripciones automáticamente hay que conectar una pasarela de pagos compatible con Yape que confirme el pago. El `payment-webhook` ya está preparado para recibir esa confirmación.

## 10. Prueba segura
Antes de enviar mensajes reales:
- usa una cuenta de prueba;
- coloca un correo de prueba;
- configura WhatsApp solo después de aprobar la plantilla;
- prueba la Edge Function manualmente;
- revisa `notification_log` para confirmar que no se duplican avisos.

No introduzcas claves secretas en el HTML.
