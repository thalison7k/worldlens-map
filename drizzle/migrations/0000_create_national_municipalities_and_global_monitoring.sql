CREATE TABLE public.brazilian_municipalities (
  ibge_code bigint PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  uf char(2) NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  radius_km integer NOT NULL DEFAULT 40 CHECK (radius_km BETWEEN 10 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lat BETWEEN -90 AND 90),
  CHECK (lng BETWEEN -180 AND 180)
);

GRANT SELECT ON public.brazilian_municipalities TO anon, authenticated;
GRANT ALL ON public.brazilian_municipalities TO service_role;

ALTER TABLE public.brazilian_municipalities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read Brazilian municipalities"
ON public.brazilian_municipalities
FOR SELECT
TO anon, authenticated
USING (true);

CREATE INDEX brazilian_municipalities_name_search_idx
ON public.brazilian_municipalities
USING gin (to_tsvector('portuguese', name || ' ' || uf));

CREATE INDEX brazilian_municipalities_uf_name_idx
ON public.brazilian_municipalities (uf, name);

CREATE TABLE public.global_monitoring_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  municipality_code bigint REFERENCES public.brazilian_municipalities(ibge_code),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.global_monitoring_config TO anon, authenticated;
GRANT ALL ON public.global_monitoring_config TO service_role;

ALTER TABLE public.global_monitoring_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read global monitoring config"
ON public.global_monitoring_config
FOR SELECT
TO anon, authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.set_global_monitored_municipality(_municipality_code bigint)
RETURNS public.global_monitoring_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.global_monitoring_config;
BEGIN
  IF _municipality_code IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.brazilian_municipalities WHERE ibge_code = _municipality_code
  ) THEN
    RAISE EXCEPTION 'Municipality not found';
  END IF;

  INSERT INTO public.global_monitoring_config (singleton, municipality_code, updated_at)
  VALUES (true, _municipality_code, now())
  ON CONFLICT (singleton) DO UPDATE
  SET municipality_code = EXCLUDED.municipality_code,
      updated_at = EXCLUDED.updated_at
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_global_monitored_municipality(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_global_monitored_municipality(bigint) TO anon, authenticated, service_role;
