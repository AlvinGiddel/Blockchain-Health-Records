// Supabase Edge Function: Remote Licensing Check (Kill-Switch)
// Follows Deno runtime standards for Supabase Edge Functions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only GET requests are accepted
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Only GET is supported.' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    
    // Extract client_id: last segment of pathname (or query param fallback ?client_id=...)
    let clientId = pathSegments[pathSegments.length - 1];
    
    // If the path is just /check-license or /functions/v1/check-license, check query parameter
    if (!clientId || clientId === 'check-license' || clientId === 'v1' || clientId === 'functions') {
      clientId = url.searchParams.get('client_id') || '';
    }

    if (!clientId || typeof clientId !== 'string' || clientId.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'client_id is required in the path segment or query string.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const cleanClientId = decodeURIComponent(clientId).trim();

    // Initialize Supabase Admin Client using Edge Function environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[License Server Error] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
      return new Response(
        JSON.stringify({ status: 'disabled', reason: 'server_configuration_error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query licenses table
    const { data: license, error } = await supabase
      .from('licenses')
      .select('client_id, status, expires_at')
      .eq('client_id', cleanClientId)
      .maybeSingle();

    if (error) {
      console.error(`[License Server Error] Database query error for client '${cleanClientId}':`, error);
      return new Response(
        JSON.stringify({ status: 'disabled', reason: 'database_error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // If client ID not found, return disabled with reason
    if (!license) {
      console.warn(`[License Check] Unknown client_id requested: '${cleanClientId}'`);
      return new Response(
        JSON.stringify({ status: 'disabled', reason: 'not_found' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check expiration override: if expires_at is set and in the past, status is disabled
    if (license.expires_at) {
      const expirationDate = new Date(license.expires_at);
      if (!isNaN(expirationDate.getTime()) && expirationDate < new Date()) {
        console.warn(`[License Check] License for '${cleanClientId}' expired at ${license.expires_at}`);
        return new Response(
          JSON.stringify({ status: 'disabled', reason: 'expired', expires_at: license.expires_at }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Check manual status column
    if (license.status !== 'active') {
      console.warn(`[License Check] License for '${cleanClientId}' is manually marked as: ${license.status}`);
      return new Response(
        JSON.stringify({ status: 'disabled', reason: 'revoked' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // License is active and valid
    return new Response(
      JSON.stringify({ status: 'active', client_id: cleanClientId }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[License Check Unexpected Error]:', errorMsg);
    return new Response(
      JSON.stringify({ status: 'disabled', reason: 'unexpected_error', message: errorMsg }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
