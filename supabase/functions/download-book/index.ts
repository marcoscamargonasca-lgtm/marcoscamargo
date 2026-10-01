import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SECRET_KEY")!;

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response("Unauthorized",{status:401});

    const userClient = createClient(URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: auth } }
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return new Response("Unauthorized",{status:401});

    const admin = createClient(URL, KEY);
    const { book_id } = await req.json();
    if (!book_id) return new Response("book_id requerido",{status:400});

    const { data: access, error } = await admin
      .from("library_access")
      .select("file_path,title")
      .eq("user_id", user.id)
      .eq("book_id", book_id)
      .maybeSingle();

    if (error || !access) return new Response("Sin acceso",{status:403});

    const { data, error: signError } = await admin.storage
      .from("libros")
      .createSignedUrl(access.file_path, 300);

    if (signError || !data?.signedUrl)
      return new Response("No se pudo generar el enlace",{status:500});

    return Response.json({url:data.signedUrl,title:access.title,expires_in:300});
  } catch (e) {
    return new Response("Error interno",{status:500});
  }
});
