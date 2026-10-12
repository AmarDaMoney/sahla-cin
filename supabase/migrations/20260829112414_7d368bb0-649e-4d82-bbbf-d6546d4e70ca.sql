-- ENUMS
CREATE TYPE public.app_role AS ENUM ('client','contributeur','admin','agent_guichet');
CREATE TYPE public.hall_type AS ENUM ('standard','vip');
CREATE TYPE public.audio_language AS ENUM ('VO','VF','VOSTFR','VOSTAR','AR_DUB');
CREATE TYPE public.publish_status AS ENUM ('brouillon','en_revue','publie');
CREATE TYPE public.booking_status AS ENUM ('en_attente_paiement','confirme','annule');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- GEO / VENUES
CREATE TABLE public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cities TO anon, authenticated;
GRANT ALL ON public.cities TO service_role;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cinemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE RESTRICT,
  address text,
  latitude double precision,
  longitude double precision,
  description text,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cinemas TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cinemas TO authenticated;
GRANT ALL ON public.cinemas TO service_role;
ALTER TABLE public.cinemas ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.halls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cinema_id uuid NOT NULL REFERENCES public.cinemas(id) ON DELETE CASCADE,
  name text NOT NULL,
  capacity integer NOT NULL DEFAULT 60,
  type public.hall_type NOT NULL DEFAULT 'standard',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.halls TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.halls TO authenticated;
GRANT ALL ON public.halls TO service_role;
ALTER TABLE public.halls ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id uuid NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE,
  row_label text NOT NULL,
  seat_number integer NOT NULL,
  seat_type text NOT NULL DEFAULT 'standard',
  UNIQUE (hall_id, row_label, seat_number)
);
GRANT SELECT ON public.seats TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.seats TO authenticated;
GRANT ALL ON public.seats TO service_role;
ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cinema_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cinema_id uuid NOT NULL REFERENCES public.cinemas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cinema_id)
);
GRANT SELECT ON public.cinema_staff TO authenticated;
GRANT ALL ON public.cinema_staff TO service_role;
ALTER TABLE public.cinema_staff ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_cinema_staff(_user_id uuid, _cinema_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.cinema_staff WHERE user_id = _user_id AND cinema_id = _cinema_id);
$$;

CREATE OR REPLACE FUNCTION public.is_staff_of_hall(_user_id uuid, _hall_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.halls h
    JOIN public.cinema_staff cs ON cs.cinema_id = h.cinema_id
    WHERE h.id = _hall_id AND cs.user_id = _user_id
  );
$$;

-- CINEMA DOMAIN
CREATE TABLE public.movies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  poster_url text,
  duration_minutes integer NOT NULL DEFAULT 100,
  synopsis text,
  genre text,
  age_rating text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.movies TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.movies TO authenticated;
GRANT ALL ON public.movies TO service_role;
ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;

-- TICKETING DOMAIN
CREATE TABLE public.screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id uuid NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE,
  movie_id uuid NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  audio_language public.audio_language NOT NULL DEFAULT 'VF',
  price numeric(10,2) NOT NULL DEFAULT 500,
  status public.publish_status NOT NULL DEFAULT 'brouillon',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.screenings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.screenings TO authenticated;
GRANT ALL ON public.screenings TO service_role;
ALTER TABLE public.screenings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.program_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cinema_id uuid NOT NULL REFERENCES public.cinemas(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  status public.publish_status NOT NULL DEFAULT 'brouillon',
  submitted_by uuid,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cinema_id, week_start)
);
GRANT SELECT, INSERT, UPDATE ON public.program_weeks TO authenticated;
GRANT ALL ON public.program_weeks TO service_role;
ALTER TABLE public.program_weeks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  screening_id uuid NOT NULL REFERENCES public.screenings(id) ON DELETE CASCADE,
  status public.booking_status NOT NULL DEFAULT 'en_attente_paiement',
  qr_code text,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.booking_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  seat_id uuid NOT NULL REFERENCES public.seats(id) ON DELETE CASCADE,
  UNIQUE (booking_id, seat_id)
);
GRANT SELECT, INSERT, DELETE ON public.booking_seats TO authenticated;
GRANT SELECT ON public.booking_seats TO anon;
GRANT ALL ON public.booking_seats TO service_role;
ALTER TABLE public.booking_seats ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  qr_code text NOT NULL UNIQUE,
  scanned boolean NOT NULL DEFAULT false,
  scanned_at timestamptz,
  scanned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "cities public read" ON public.cities FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "cities admin write" ON public.cities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "cinemas public read" ON public.cinemas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "cinemas admin write" ON public.cinemas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "halls public read" ON public.halls FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "halls admin write" ON public.halls FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "seats public read" ON public.seats FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "seats admin write" ON public.seats FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "movies public read" ON public.movies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "movies admin write" ON public.movies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "staff read own assignment" ON public.cinema_staff FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "screenings public read published" ON public.screenings FOR SELECT TO anon USING (status = 'publie');
CREATE POLICY "screenings auth read" ON public.screenings FOR SELECT TO authenticated
  USING (status = 'publie' OR public.has_role(auth.uid(),'admin') OR public.is_staff_of_hall(auth.uid(), hall_id));
CREATE POLICY "screenings admin write" ON public.screenings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "screenings staff insert" ON public.screenings FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_of_hall(auth.uid(), hall_id) AND status <> 'publie');
CREATE POLICY "screenings staff update" ON public.screenings FOR UPDATE TO authenticated
  USING (public.is_staff_of_hall(auth.uid(), hall_id) AND status <> 'publie')
  WITH CHECK (public.is_staff_of_hall(auth.uid(), hall_id) AND status <> 'publie');
CREATE POLICY "screenings staff delete" ON public.screenings FOR DELETE TO authenticated
  USING (public.is_staff_of_hall(auth.uid(), hall_id) AND status <> 'publie');

CREATE POLICY "program read" ON public.program_weeks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_cinema_staff(auth.uid(), cinema_id));
CREATE POLICY "program staff insert" ON public.program_weeks FOR INSERT TO authenticated
  WITH CHECK (public.is_cinema_staff(auth.uid(), cinema_id) AND status <> 'publie');
CREATE POLICY "program staff update" ON public.program_weeks FOR UPDATE TO authenticated
  USING (public.is_cinema_staff(auth.uid(), cinema_id) AND status <> 'publie')
  WITH CHECK (public.is_cinema_staff(auth.uid(), cinema_id) AND status <> 'publie');
CREATE POLICY "program admin all" ON public.program_weeks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "bookings own read" ON public.bookings FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent_guichet'));
CREATE POLICY "bookings own insert" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bookings own update" ON public.bookings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "booking seats read" ON public.booking_seats FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "booking seats insert own" ON public.booking_seats FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid()));
CREATE POLICY "booking seats delete own" ON public.booking_seats FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid()));

CREATE POLICY "tickets read" ON public.tickets FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'agent_guichet')
  );
CREATE POLICY "tickets insert own" ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid()));
CREATE POLICY "tickets scan update" ON public.tickets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'agent_guichet') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'agent_guichet') OR public.has_role(auth.uid(),'admin'));

-- NEW USER TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEAT GENERATION
CREATE OR REPLACE FUNCTION public.generate_seats_for_hall(_hall_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cap integer;
  htype public.hall_type;
  cols integer;
  rows_count integer;
  r integer;
  c integer;
BEGIN
  SELECT capacity, type INTO cap, htype FROM public.halls WHERE id = _hall_id;
  IF cap IS NULL THEN RETURN; END IF;
  cols := 10;
  rows_count := CEIL(cap::numeric / cols);
  FOR r IN 1..rows_count LOOP
    FOR c IN 1..cols LOOP
      EXIT WHEN (r - 1) * cols + c > cap;
      INSERT INTO public.seats (hall_id, row_label, seat_number, seat_type)
      VALUES (_hall_id, CHR(64 + r), c, CASE WHEN htype = 'vip' THEN 'vip' ELSE 'standard' END)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.halls_autoseat() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.generate_seats_for_hall(NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER halls_generate_seats AFTER INSERT ON public.halls
FOR EACH ROW EXECUTE FUNCTION public.halls_autoseat();

ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_seats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.screenings;

-- SEED DATA
INSERT INTO public.cities (id, name) VALUES
  ('11111111-1111-1111-1111-111111111101','Alger'),
  ('11111111-1111-1111-1111-111111111102','Oran'),
  ('11111111-1111-1111-1111-111111111103','Constantine');

INSERT INTO public.cinemas (id, name, city_id, address, latitude, longitude, description) VALUES
  ('22222222-2222-2222-2222-222222222201','Ibn Khaldoun','11111111-1111-1111-1111-111111111101','Rue Docteur Saadane, Alger Centre',36.774048,3.057131,'Salle historique du centre d''Alger.'),
  ('22222222-2222-2222-2222-222222222202','Ibn Zaydoun','11111111-1111-1111-1111-111111111101','Riadh El Feth, El Madania, Alger',36.743226,3.069799,'Salle de l''esplanade Riadh El Feth.'),
  ('22222222-2222-2222-2222-222222222203','Cosmos','11111111-1111-1111-1111-111111111101','Riadh El Feth, El Madania, Alger',36.743191,3.070179,'Deux salles modernes à Riadh El Feth.'),
  ('22222222-2222-2222-2222-222222222204','Multiplex TMV Garden City','11111111-1111-1111-1111-111111111101','Garden City, Chéraga, Alger',36.750761,2.951721,'Multiplexe trois salles à Chéraga.'),
  ('22222222-2222-2222-2222-222222222205','Multiplex Cinégold Es Senia','11111111-1111-1111-1111-111111111102','Es Senia, Oran',35.638453,-0.590899,'Multiplexe trois salles dont une VIP.'),
  ('22222222-2222-2222-2222-222222222206','AZ Grand Ciné','11111111-1111-1111-1111-111111111102','Front de mer, Oran',35.675803,-0.600621,'Deux salles au coeur d''Oran.'),
  ('22222222-2222-2222-2222-222222222207','Ahmed Bey','11111111-1111-1111-1111-111111111103','Complexe culturel Zénith, Constantine',36.295208,6.623640,'Grande salle du complexe Zénith.');

INSERT INTO public.halls (id, cinema_id, name, capacity, type) VALUES
  ('33333333-3333-3333-3333-333333333301','22222222-2222-2222-2222-222222222201','Salle 1',120,'standard'),
  ('33333333-3333-3333-3333-333333333302','22222222-2222-2222-2222-222222222202','Salle 1',100,'standard'),
  ('33333333-3333-3333-3333-333333333303','22222222-2222-2222-2222-222222222203','Alpha',80,'standard'),
  ('33333333-3333-3333-3333-333333333304','22222222-2222-2222-2222-222222222203','Beta',60,'standard'),
  ('33333333-3333-3333-3333-333333333305','22222222-2222-2222-2222-222222222204','Salle 1',90,'standard'),
  ('33333333-3333-3333-3333-333333333306','22222222-2222-2222-2222-222222222204','Salle 2',70,'standard'),
  ('33333333-3333-3333-3333-333333333307','22222222-2222-2222-2222-222222222204','Salle 3',50,'standard'),
  ('33333333-3333-3333-3333-333333333308','22222222-2222-2222-2222-222222222205','Mega',110,'standard'),
  ('33333333-3333-3333-3333-333333333309','22222222-2222-2222-2222-222222222205','Mira',80,'standard'),
  ('33333333-3333-3333-3333-333333333310','22222222-2222-2222-2222-222222222205','VIP',40,'vip'),
  ('33333333-3333-3333-3333-333333333311','22222222-2222-2222-2222-222222222206','César',90,'standard'),
  ('33333333-3333-3333-3333-333333333312','22222222-2222-2222-2222-222222222206','Odyssée',70,'standard'),
  ('33333333-3333-3333-3333-333333333313','22222222-2222-2222-2222-222222222207','Salle 1',150,'standard');

INSERT INTO public.movies (id, title, duration_minutes, genre, age_rating, synopsis) VALUES
  ('44444444-4444-4444-4444-444444444401','Insidious : L''Invasion du lointain',108,'Horreur','-16','La famille Lambert affronte une nouvelle intrusion venue du Lointain, un territoire spirituel dont personne ne revient indemne.'),
  ('44444444-4444-4444-4444-444444444402','Spider-Man : Brand New Day',132,'Action','Tous publics','Peter Parker repart de zéro dans un New York qui a oublié son nom, entre nouvelles menaces et vieilles blessures.'),
  ('44444444-4444-4444-4444-444444444403','Marius et le royaume des mers',96,'Animation','Tous publics','Un jeune pêcheur découvre un royaume sous-marin menacé et devient malgré lui son dernier espoir.'),
  ('44444444-4444-4444-4444-444444444404','Pat'' Patrouille : Mission Dino',88,'Animation','Tous publics','La Pat'' Patrouille part sur la piste de dinosaures échappés d''une vallée oubliée.'),
  ('44444444-4444-4444-4444-444444444405','La Fin d''Oak Street',114,'Drame','-12','Les derniers habitants d''une rue promise à la démolition se battent pour garder leur quartier vivant.'),
  ('44444444-4444-4444-4444-444444444406','Vaiana (live action)',124,'Aventure','Tous publics','L''adaptation en prises de vues réelles du voyage de Vaiana à travers le Pacifique.'),
  ('44444444-4444-4444-4444-444444444407','Toy Story 5',100,'Animation','Tous publics','Woody, Buzz et la bande font face à une nouvelle génération de jouets connectés.'),
  ('44444444-4444-4444-4444-444444444408','Backrooms',102,'Horreur','-16','Piégés dans un dédale de couloirs sans fin, des adolescents cherchent une sortie qui n''existe peut-être pas.'),
  ('44444444-4444-4444-4444-444444444409','Minions & Monsters',95,'Animation','Tous publics','Les Minions s''associent à des monstres maladroits pour sauver leur ville d''un savant trop ambitieux.'),
  ('44444444-4444-4444-4444-444444444410','Michael Jackson',140,'Biopic','-12','Le parcours du roi de la pop, de l''enfance à Gary jusqu''aux scènes les plus vastes du monde.'),
  ('44444444-4444-4444-4444-444444444411','Poupiya',92,'Comédie','Tous publics','Une comédie familiale algérienne pleine de quiproquos autour d''un mariage qui déraille.');

INSERT INTO public.screenings (hall_id, movie_id, starts_at, audio_language, price, status)
SELECT h.hall_id, m.movie_id, (CURRENT_DATE + s.day_offset)::timestamptz + s.hour_offset, s.lang, s.price, 'publie'
FROM (VALUES
  ('44444444-4444-4444-4444-444444444401'::uuid,'33333333-3333-3333-3333-333333333301'::uuid,0,interval '15 hours','VOSTFR'::public.audio_language,600),
  ('44444444-4444-4444-4444-444444444401','33333333-3333-3333-3333-333333333308',0,interval '21 hours','VF',700),
  ('44444444-4444-4444-4444-444444444402','33333333-3333-3333-3333-333333333303',0,interval '14 hours','VF',600),
  ('44444444-4444-4444-4444-444444444402','33333333-3333-3333-3333-333333333305',1,interval '18 hours','VOSTFR',800),
  ('44444444-4444-4444-4444-444444444402','33333333-3333-3333-3333-333333333313',1,interval '21 hours','AR_DUB',500),
  ('44444444-4444-4444-4444-444444444403','33333333-3333-3333-3333-333333333304',0,interval '13 hours','AR_DUB',400),
  ('44444444-4444-4444-4444-444444444403','33333333-3333-3333-3333-333333333311',1,interval '16 hours','VF',500),
  ('44444444-4444-4444-4444-444444444404','33333333-3333-3333-3333-333333333307',0,interval '11 hours','AR_DUB',400),
  ('44444444-4444-4444-4444-444444444404','33333333-3333-3333-3333-333333333309',1,interval '14 hours','VF',450),
  ('44444444-4444-4444-4444-444444444405','33333333-3333-3333-3333-333333333302',0,interval '19 hours','VOSTFR',600),
  ('44444444-4444-4444-4444-444444444405','33333333-3333-3333-3333-333333333312',2,interval '20 hours','VO',600),
  ('44444444-4444-4444-4444-444444444406','33333333-3333-3333-3333-333333333305',0,interval '15 hours','VF',700),
  ('44444444-4444-4444-4444-444444444406','33333333-3333-3333-3333-333333333310',1,interval '19 hours','VOSTFR',1200),
  ('44444444-4444-4444-4444-444444444407','33333333-3333-3333-3333-333333333306',0,interval '12 hours','AR_DUB',500),
  ('44444444-4444-4444-4444-444444444407','33333333-3333-3333-3333-333333333313',2,interval '15 hours','VF',500),
  ('44444444-4444-4444-4444-444444444408','33333333-3333-3333-3333-333333333303',1,interval '22 hours','VOSTFR',600),
  ('44444444-4444-4444-4444-444444444408','33333333-3333-3333-3333-333333333311',2,interval '21 hours','VO',600),
  ('44444444-4444-4444-4444-444444444409','33333333-3333-3333-3333-333333333307',1,interval '13 hours','AR_DUB',400),
  ('44444444-4444-4444-4444-444444444409','33333333-3333-3333-3333-333333333309',2,interval '11 hours','VF',450),
  ('44444444-4444-4444-4444-444444444410','33333333-3333-3333-3333-333333333301',1,interval '20 hours','VOSTFR',700),
  ('44444444-4444-4444-4444-444444444410','33333333-3333-3333-3333-333333333310',2,interval '21 hours','VO',1300),
  ('44444444-4444-4444-4444-444444444411','33333333-3333-3333-3333-333333333302',0,interval '17 hours','VO',500),
  ('44444444-4444-4444-4444-444444444411','33333333-3333-3333-3333-333333333312',1,interval '18 hours','VO',500),
  ('44444444-4444-4444-4444-444444444411','33333333-3333-3333-3333-333333333313',2,interval '18 hours','VO',500)
) AS s(movie_id, hall_id, day_offset, hour_offset, lang, price)
CROSS JOIN LATERAL (SELECT s.hall_id AS hall_id) h
CROSS JOIN LATERAL (SELECT s.movie_id AS movie_id) m;