import { supabase } from "@/integrations/supabase/client";
import type { Prefeitura } from "@/lib/prefeituras";

type MunicipalityRow = {
  ibge_code: number;
  slug: string;
  name: string;
  uf: string;
  lat: number;
  lng: number;
  radius_km: number;
};

export type CloudPrefeitura = Prefeitura & { ibgeCode: number };

function mapMunicipality(row: MunicipalityRow): CloudPrefeitura {
  return {
    ibgeCode: row.ibge_code,
    slug: row.slug,
    name: row.name,
    uf: row.uf,
    lat: row.lat,
    lng: row.lng,
    radiusKm: row.radius_km,
  };
}

export async function searchPrefeituras(query = "", page = 0, pageSize = 60) {
  const from = page * pageSize;
  let request = supabase
    .from("brazilian_municipalities")
    .select("ibge_code,slug,name,uf,lat,lng,radius_km", { count: "exact" })
    .order("name")
    .order("uf")
    .range(from, from + pageSize - 1);

  const term = query.trim().replace(/[,%()]/g, " ");
  if (term) request = request.or(`name.ilike.%${term}%,uf.ilike.${term}%`);
  const { data, count, error } = await request;
  if (error) throw error;
  return { list: (data as MunicipalityRow[]).map(mapMunicipality), count: count ?? 0 };
}

export async function getPrefeituraCloud(slug: string) {
  const { data, error } = await supabase
    .from("brazilian_municipalities")
    .select("ibge_code,slug,name,uf,lat,lng,radius_km")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data ? mapMunicipality(data as MunicipalityRow) : null;
}

export async function getMonitoredCloud() {
  const { data: config, error: configError } = await supabase
    .from("global_monitoring_config")
    .select("municipality_code,updated_at")
    .eq("singleton", true)
    .maybeSingle();
  if (configError) throw configError;
  if (!config?.municipality_code) return null;

  const { data, error } = await supabase
    .from("brazilian_municipalities")
    .select("ibge_code,slug,name,uf,lat,lng,radius_km")
    .eq("ibge_code", config.municipality_code)
    .maybeSingle();
  if (error) throw error;
  return data ? mapMunicipality(data as MunicipalityRow) : null;
}

export async function setMonitoredCloud(ibgeCode: number | null) {
  const { error } = await supabase.rpc("set_global_monitored_municipality", {
    _municipality_code: ibgeCode as number,
  });
  if (error) throw error;
  window.dispatchEvent(new CustomEvent("geoos:prefeitura-monitorada", { detail: ibgeCode }));
}