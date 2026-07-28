CREATE TABLE public.sensor_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  device_label text,
  device_kind text NOT NULL DEFAULT 'smartphone',
  platform text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy_m double precision,
  network_type text,
  downlink_mbps double precision,
  battery_pct double precision,
  temperature_c double precision,
  air_pm25 double precision,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sensor_readings_created_at_idx ON public.sensor_readings (created_at DESC);
CREATE INDEX sensor_readings_device_idx ON public.sensor_readings (device_id, created_at DESC);

GRANT SELECT, INSERT ON public.sensor_readings TO anon;
GRANT SELECT, INSERT ON public.sensor_readings TO authenticated;
GRANT ALL ON public.sensor_readings TO service_role;

ALTER TABLE public.sensor_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read sensor readings"
  ON public.sensor_readings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can publish a sensor reading"
  ON public.sensor_readings FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    lat BETWEEN -90 AND 90
    AND lng BETWEEN -180 AND 180
    AND length(device_id) BETWEEN 6 AND 64
    AND (device_label IS NULL OR length(device_label) <= 40)
    AND (note IS NULL OR length(note) <= 160)
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.sensor_readings;