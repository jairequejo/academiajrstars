// supabaseClient.js
// IMPORTANTE: Este archivo debe ser cargado DESPUÉS del script CDN de Supabase en el HTML
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
// <script src="/js/supabaseClient.js"></script>

const SUPABASE_URL = "https://ovlhjnwwyvkclbaykpmp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bGhqbnd3eXZrY2xiYXlrcG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5OTUyODMsImV4cCI6MjEwMjU3MTI4M30.E_tRMi97O2mXY7DCdDMG7chl5dSYCVC_tgTE_MFcXqw";

if (typeof supabase !== 'undefined') {
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.error("Supabase CDN no está cargado.");
}
