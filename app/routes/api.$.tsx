import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, ngrok-skip-browser-warning, Accept",
  "Access-Control-Max-Age": "86400",
};

// Handle all OPTIONS preflight requests
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }
  
  return new Response("Not Found", { status: 404, headers: corsHeaders });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }
  
  return new Response("Not Found", { status: 404, headers: corsHeaders });
};