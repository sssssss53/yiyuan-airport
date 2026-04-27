export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ error: "Missing DB binding. Please bind KV namespace." }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }

  try {
    if (request.method === "GET") {
      let data = await env.DB.get("GLOBAL_RECORD");
      if (!data) {
        data = JSON.stringify({ users: [], orders: [] });
      }
      return new Response(data, { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    if (request.method === "POST") {
      const body = await request.text();
      await env.DB.put("GLOBAL_RECORD", body);
      return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}
