# Pasillo del Rey — cuentas + biblioteca privada + pagos

## Qué incluye
- Registro e inicio de sesión con Supabase Auth.
- Biblioteca privada por usuario.
- PDFs en bucket privado `libros`.
- Descargas mediante enlaces firmados de 5 minutos.
- Suscripciones y pagos en Supabase.
- Edge Function `download-book` que comprueba autorización antes de descargar.
- Edge Function `payment-webhook` preparada para recibir la confirmación automática de una pasarela de pagos.

## 1. Supabase
1. Abre SQL Editor.
2. Ejecuta `supabase_schema.sql`.
3. En Storage confirma el bucket privado `libros`.
4. Sube tus PDF al bucket `libros` usando exactamente los nombres de `file_path`.

## 2. Publicar Edge Functions
Con Supabase CLI:
```bash
supabase functions deploy download-book
supabase functions deploy payment-webhook --no-verify-jwt
```

Configura los secrets del proyecto:
```text
SUPABASE_SECRET_KEY=TU_SECRET_KEY_DE_SUPABASE
SUPABASE_PUBLISHABLE_KEY=TU_PUBLISHABLE_KEY
PAYMENT_WEBHOOK_SECRET=UN_SECRETO_LARGO_Y_ALEATORIO
```

No pongas `SUPABASE_SECRET_KEY` en `index.html` ni en GitHub.

## 3. Frontend
En `index.html`, reemplaza:
```js
const KEY="PEGA_AQUI_TU_PUBLISHABLE_KEY";
```
por tu Publishable Key de Supabase.

La Publishable Key sí puede estar en el frontend; la Secret Key nunca.

## 4. Pago automático
El QR estático de Yape no informa por sí solo a la web de que se realizó un pago.
Para automatización real necesitas contratar/configurar una pasarela que soporte Yape y webhooks. Yape indica que para integrar pagos por Internet en la página de un comercio se debe trabajar con una pasarela como Culqi, Niubiz o Izipay.

Cuando la pasarela esté habilitada, configura su webhook para llamar:
`https://sozopfatthuryfxmhiek.supabase.co/functions/v1/payment-webhook`

El webhook debe entregar/adaptarse a:
- user_id
- payment_id
- amount
- provider
- subscription_id (si es membresía)
- expires_at (si corresponde)

La función registra el pago, activa la suscripción y asigna los libros.

## 5. Flujo final
Alumno -> crea cuenta -> selecciona plan -> paga con Yape en la pasarela -> pasarela confirma pago -> webhook -> Supabase activa suscripción -> biblioteca privada -> descarga con URL temporal.

## Seguridad
No uses una URL pública para los PDFs. El bucket `libros` debe permanecer privado.
