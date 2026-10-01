// Webhook de pagos.
// IMPORTANTE: este endpoint está preparado para conectar Yape mediante una
// pasarela que entregue webhooks (por ejemplo, una pasarela compatible con Yape).
// No se debe conectar directamente al QR de Yape: un QR estático no proporciona
// confirmación de pago a la web.
//
// Configura los secrets:
// SUPABASE_URL
// SUPABASE_SECRET_KEY
// PAYMENT_WEBHOOK_SECRET
//
// El proveedor debe enviar un evento normalizado o adaptar el bloque de mapeo:
// { type:"payment.paid", payment_id:"...", user_id:"...", amount:15,
//   currency:"PEN", subscription_id:"...", expires_at:"2026-..." }

import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SECRET_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PAYMENT_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed",{status:405});

  const secret = req.headers.get("x-webhook-secret");
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET)
    return new Response("Unauthorized",{status:401});

  try {
    const body = await req.json();

    if (body.type !== "payment.paid")
      return Response.json({ok:true,ignored:true});

    const admin = createClient(URL,KEY);
    const payment = {
      user_id: body.user_id,
      provider: body.provider || "yape",
      provider_payment_id: body.payment_id,
      amount: Number(body.amount),
      currency: body.currency || "PEN",
      status: "paid",
      metadata: body.metadata || {},
      paid_at: body.paid_at || new Date().toISOString()
    };

    const { error: pError } = await admin.from("payments")
      .upsert(payment,{onConflict:"provider_payment_id"});
    if (pError) throw pError;

    if (body.subscription_id) {
      const { error: sError } = await admin.from("subscriptions").upsert({
        user_id: body.user_id,
        provider: body.provider || "yape",
        provider_subscription_id: body.subscription_id,
        status: "active",
        starts_at: new Date().toISOString(),
        expires_at: body.expires_at || null
      },{onConflict:"provider_subscription_id"});
      if (sError) throw sError;
    }

    // Habilita todos los libros activos para la suscripción.
    const { data: books, error: bError } = await admin
      .from("books").select("id").eq("active",true);
    if (bError) throw bError;

    if (books?.length) {
      const rows=books.map((b:any)=>({user_id:body.user_id,book_id:b.id}));
      const { error:eError }=await admin.from("book_entitlements")
        .upsert(rows,{onConflict:"user_id,book_id"});
      if(eError) throw eError;
    }

    return Response.json({ok:true});
  } catch (e) {
    console.error(e);
    return new Response("Webhook error",{status:500});
  }
});
