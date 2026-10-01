import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEY = Deno.env.get("SUPABASE_SECRET_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Pasillo del Rey <onboarding@resend.dev>";

const WA_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
const WA_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
const WA_TEMPLATE_NAME = Deno.env.get("WHATSAPP_TEMPLATE_NAME") || "";
const WA_TEMPLATE_LANG = Deno.env.get("WHATSAPP_TEMPLATE_LANG") || "es";

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

function limaDate(d: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(d));
}

function daysBefore(exp: string) {
  const today = new Date(limaDate(new Date()) + "T00:00:00Z");
  const end = new Date(limaDate(exp) + "T00:00:00Z");
  return Math.round((end.getTime() - today.getTime()) / 86400000);
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

async function sendEmail(to: string, subject: string, html: string, idem: string) {
  if (!RESEND_API_KEY) return { ok:false, skipped:true, reason:"RESEND_API_KEY no configurada" };

  const r = await fetch("https://api.resend.com/emails", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${RESEND_API_KEY}`,
      "Idempotency-Key": idem
    },
    body: JSON.stringify({from:EMAIL_FROM,to:[to],subject,html})
  });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(`Resend: ${r.status} ${JSON.stringify(data)}`);
  return {ok:true,id:data?.id};
}

async function sendWhatsApp(to: string, variables: string[]) {
  if (!WA_TOKEN || !WA_PHONE_NUMBER_ID || !WA_TEMPLATE_NAME) {
    return { ok:false, skipped:true, reason:"WhatsApp Business API no configurada" };
  }

  const r = await fetch(
    `https://graph.facebook.com/vXX.X/${WA_PHONE_NUMBER_ID}/messages`,
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${WA_TOKEN}`
      },
      body:JSON.stringify({
        messaging_product:"whatsapp",
        to:normalizePhone(to),
        type:"template",
        template:{
          name:WA_TEMPLATE_NAME,
          language:{code:WA_TEMPLATE_LANG},
          components:[{
            type:"body",
            parameters:variables.map(text=>({type:"text",text}))
          }]
        }
      })
    }
  );
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(`WhatsApp: ${r.status} ${JSON.stringify(data)}`);
  return {ok:true,id:data?.messages?.[0]?.id};
}

function messageFor(days:number, student:string, expiry:string) {
  const date = limaDate(expiry);
  if(days===7) return {
    subject:`Recordatorio: suscripción de ${student} vence en 7 días`,
    title:"Tu suscripción vence en 7 días",
    body:`La suscripción de ${student} vence el ${date}. Puedes renovarla para mantener el acceso a la biblioteca y beneficios de Pasillo del Rey.`
  };
  if(days===3) return {
    subject:`Recordatorio: suscripción de ${student} vence en 3 días`,
    title:"Tu suscripción vence en 3 días",
    body:`La suscripción de ${student} vence el ${date}. Recuerda renovarla para mantener el acceso a los contenidos.`
  };
  if(days===1) return {
    subject:`Recordatorio: suscripción de ${student} vence mañana`,
    title:"Tu suscripción vence mañana",
    body:`La suscripción de ${student} vence mañana (${date}).`
  };
  if(days===0) return {
    subject:`Hoy vence la suscripción de ${student}`,
    title:"La suscripción vence hoy",
    body:`La suscripción de ${student} vence hoy (${date}).`
  };
  return {
    subject:`Suscripción de ${student} vencida`,
    title:"La suscripción ha vencido",
    body:`La suscripción de ${student} venció el ${date}. Renueva para recuperar el acceso a los contenidos premium.`
  };
}

Deno.serve(async (req) => {
  if(req.method !== "POST") return new Response("Method not allowed",{status:405});

  try {
    const { data: subs, error } = await admin
      .from("subscriptions")
      .select("id,user_id,status,expires_at")
      .in("status",["active","expired"])
      .not("expires_at","is",null);

    if(error) throw error;

    let processed=0, sent=0, skipped=0, failed=0;

    for(const sub of (subs || [])) {
      const days = daysBefore(sub.expires_at);
      if(![7,3,1,0,-1].includes(days)) continue;

      if(days <= 0 && sub.status === "active") {
        await admin.from("subscriptions").update({status:"expired"}).eq("id",sub.id);
      }

      const {data: profile} = await admin
        .from("profiles")
        .select("nombre,apoderado_nombre,apoderado_whatsapp,apoderado_email,notificaciones_whatsapp,notificaciones_email")
        .eq("id",sub.user_id)
        .maybeSingle();

      if(!profile) continue;
      const student=profile.nombre || "el alumno";
      const m=messageFor(days,student,sub.expires_at);
      processed++;

      const channels = [
        profile.notificaciones_email && profile.apoderado_email ? "email" : null,
        profile.notificaciones_whatsapp && profile.apoderado_whatsapp ? "whatsapp" : null
      ].filter(Boolean) as string[];

      for(const channel of channels) {
        const destination = channel==="email" ? profile.apoderado_email : profile.apoderado_whatsapp;

        const {data: existing} = await admin.from("notification_log")
          .select("id,status")
          .eq("subscription_id",sub.id)
          .eq("channel",channel)
          .eq("days_before",days)
          .maybeSingle();

        if(existing?.status==="sent") continue;

        await admin.from("notification_log").upsert({
          subscription_id:sub.id,user_id:sub.user_id,channel,
          days_before:days,destination,status:"pending"
        },{onConflict:"subscription_id,channel,days_before"});

        try {
          let result:any;
          if(channel==="email") {
            const html=`<div style="font-family:Arial,sans-serif;line-height:1.6">
              <h2>${m.title}</h2>
              <p>${m.body}</p>
              <p><strong>Academia de Ajedrez Pasillo del Rey</strong></p>
              <p>WhatsApp: 901 148 187</p>
            </div>`;
            result=await sendEmail(destination,m.subject,html,`subscription-${sub.id}-${channel}-${days}`);
          } else {
            result=await sendWhatsApp(destination,[student,limaDate(sub.expires_at),String(days)]);
          }

          if(result.ok) {
            await admin.from("notification_log").update({
              status:"sent",provider_message_id:result.id || null,sent_at:new Date().toISOString(),error_message:null
            }).eq("subscription_id",sub.id).eq("channel",channel).eq("days_before",days);
            sent++;
          } else {
            await admin.from("notification_log").update({
              status:"skipped",error_message:result.reason || "No configurado"
            }).eq("subscription_id",sub.id).eq("channel",channel).eq("days_before",days);
            skipped++;
          }
        } catch(e) {
          failed++;
          await admin.from("notification_log").update({
            status:"error",error_message:String(e)
          }).eq("subscription_id",sub.id).eq("channel",channel).eq("days_before",days);
        }
      }
    }

    return Response.json({ok:true,processed,sent,skipped,failed});
  } catch(e) {
    console.error(e);
    return new Response(JSON.stringify({ok:false,error:String(e)}),{
      status:500,headers:{"Content-Type":"application/json"}
    });
  }
});
