-- Réservation, paiement et contrôle des billets côté serveur.
--
-- Avant cette migration, le navigateur fixait lui-même le prix, le statut
-- (« confirme ») et le QR code d'une réservation, aucun verrou n'empêchait
-- deux réservations du même siège, et chaque client ne voyait que ses propres
-- sièges occupés. Désormais :
--   * les clients n'écrivent plus jamais directement dans bookings,
--     booking_seats ni tickets : tout passe par book_seats() ;
--   * un siège ne peut appartenir qu'à une seule réservation active par séance
--     (contrainte UNIQUE (screening_id, seat_id)) ;
--   * les réservations non payées expirent et libèrent leurs sièges ;
--   * seul le serveur (clé service_role, webhook du prestataire de paiement)
--     peut confirmer un paiement en ligne ;
--   * le contrôle des billets vérifie paiement, annulation, cinéma et horaire.

-- 1. Colonnes de paiement et d'expiration ------------------------------------

ALTER TABLE public.bookings
  ADD COLUMN payment_method text,
  ADD COLUMN payment_reference text,
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancel_reason text;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('cib', 'baridimob', 'dahabia', 'espece')),
  ADD CONSTRAINT bookings_total_amount_check CHECK (total_amount >= 0);

-- Supprimer une séance ne doit jamais effacer silencieusement des réservations.
ALTER TABLE public.bookings DROP CONSTRAINT bookings_screening_id_fkey;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_screening_id_fkey
  FOREIGN KEY (screening_id) REFERENCES public.screenings(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS bookings_user_id_idx ON public.bookings (user_id);
CREATE INDEX IF NOT EXISTS bookings_pending_idx ON public.bookings (screening_id, expires_at)
  WHERE status = 'en_attente_paiement';

-- 2. Un siège = une réservation active par séance ----------------------------

ALTER TABLE public.booking_seats ADD COLUMN screening_id uuid;
UPDATE public.booking_seats bs SET screening_id = b.screening_id
  FROM public.bookings b WHERE b.id = bs.booking_id;

-- Les sièges des réservations annulées sont libérés.
DELETE FROM public.booking_seats bs USING public.bookings b
  WHERE b.id = bs.booking_id AND b.status = 'annule';

-- Données de test créées avant le correctif : en cas de doublon, la réservation
-- la plus ancienne garde le siège, les suivantes sont annulées.
WITH ranked AS (
  SELECT bs.id, bs.booking_id,
         row_number() OVER (PARTITION BY bs.screening_id, bs.seat_id ORDER BY b.created_at, b.id) AS rn
  FROM public.booking_seats bs JOIN public.bookings b ON b.id = bs.booking_id
), losers AS (
  SELECT DISTINCT booking_id FROM ranked WHERE rn > 1
), cancelled AS (
  UPDATE public.bookings SET status = 'annule', cancelled_at = now(), cancel_reason = 'doublon'
  WHERE id IN (SELECT booking_id FROM losers)
  RETURNING id
)
DELETE FROM public.booking_seats WHERE booking_id IN (SELECT id FROM cancelled);

ALTER TABLE public.booking_seats
  ALTER COLUMN screening_id SET NOT NULL,
  ADD CONSTRAINT booking_seats_screening_id_fkey
    FOREIGN KEY (screening_id) REFERENCES public.screenings(id) ON DELETE RESTRICT,
  ADD CONSTRAINT booking_seats_screening_seat_key UNIQUE (screening_id, seat_id);

-- 3. Plus d'écriture directe par les clients ---------------------------------

DROP POLICY IF EXISTS "bookings own read" ON public.bookings;
DROP POLICY IF EXISTS "bookings own insert" ON public.bookings;
DROP POLICY IF EXISTS "bookings own update" ON public.bookings;
DROP POLICY IF EXISTS "booking seats read" ON public.booking_seats;
DROP POLICY IF EXISTS "booking seats insert own" ON public.booking_seats;
DROP POLICY IF EXISTS "booking seats delete own" ON public.booking_seats;
DROP POLICY IF EXISTS "tickets read" ON public.tickets;
DROP POLICY IF EXISTS "tickets insert own" ON public.tickets;
DROP POLICY IF EXISTS "tickets scan update" ON public.tickets;

REVOKE ALL ON public.bookings FROM anon, authenticated;
REVOKE ALL ON public.booking_seats FROM anon, authenticated;
REVOKE ALL ON public.tickets FROM anon, authenticated;
GRANT SELECT ON public.bookings TO authenticated;
GRANT SELECT ON public.booking_seats TO authenticated;
GRANT SELECT ON public.tickets TO authenticated;

-- Lecture : ses propres réservations, ou tout pour un administrateur. Les agents
-- de guichet passent par scan_ticket() et ne lisent plus les données clients.
CREATE POLICY "bookings own read" ON public.bookings FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "booking seats own read" ON public.booking_seats FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "tickets own read" ON public.tickets FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- 4. Fonctions ---------------------------------------------------------------

-- Libère les réservations non payées dont le délai est dépassé.
CREATE OR REPLACE FUNCTION public.release_expired_holds(_screening_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  released integer;
BEGIN
  WITH expired AS (
    UPDATE public.bookings
    SET status = 'annule', cancelled_at = now(), cancel_reason = 'expire'
    WHERE status = 'en_attente_paiement'
      AND expires_at < now()
      AND (_screening_id IS NULL OR screening_id = _screening_id)
    RETURNING id
  ), freed AS (
    DELETE FROM public.booking_seats WHERE booking_id IN (SELECT id FROM expired) RETURNING 1
  )
  SELECT count(*) INTO released FROM expired;
  RETURN released;
END;
$$;

-- Sièges occupés d'une séance (payés, ou réservés et pas encore expirés).
-- Ne renvoie que des identifiants de sièges, jamais de données clients.
CREATE OR REPLACE FUNCTION public.get_taken_seats(_screening_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT bs.seat_id
  FROM public.booking_seats bs
  JOIN public.bookings b ON b.id = bs.booking_id
  WHERE bs.screening_id = _screening_id
    AND (b.status = 'confirme' OR (b.status = 'en_attente_paiement' AND b.expires_at > now()));
$$;

-- Réserve des sièges de façon atomique. Le prix vient de la séance, jamais du
-- client. La réservation reste « en_attente_paiement » jusqu'à :
--   * confirm_booking_payment() (paiement en ligne, appelé par le serveur), ou
--   * scan_ticket(..., true) (paiement en espèces au guichet).
CREATE OR REPLACE FUNCTION public.book_seats(
  _screening_id uuid,
  _seat_ids uuid[],
  _payment_method text
)
RETURNS TABLE (booking_id uuid, qr_code text, total_amount numeric, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  uid uuid := auth.uid();
  scr record;
  seat_count integer;
  valid_seats integer;
  hold_until timestamptz;
  new_booking uuid;
  code text;
  amount numeric;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING HINT = 'Connexion requise';
  END IF;
  IF _payment_method IS NULL OR _payment_method NOT IN ('cib', 'baridimob', 'dahabia', 'espece') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING HINT = 'Moyen de paiement invalide';
  END IF;

  SELECT count(DISTINCT s) INTO seat_count FROM unnest(_seat_ids) s;
  IF seat_count IS NULL OR seat_count < 1 OR seat_count > 6 THEN
    RAISE EXCEPTION 'INVALID_SEAT_COUNT' USING HINT = 'Choisissez entre 1 et 6 sièges';
  END IF;

  SELECT s.id, s.hall_id, s.starts_at, s.price INTO scr
  FROM public.screenings s
  WHERE s.id = _screening_id AND s.status = 'publie';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCREENING_NOT_FOUND' USING HINT = 'Séance introuvable';
  END IF;
  IF scr.starts_at <= now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'BOOKING_CLOSED' USING HINT = 'Les réservations sont closes pour cette séance';
  END IF;

  SELECT count(*) INTO valid_seats
  FROM public.seats WHERE id = ANY (_seat_ids) AND hall_id = scr.hall_id;
  IF valid_seats <> seat_count THEN
    RAISE EXCEPTION 'INVALID_SEATS' USING HINT = 'Sièges invalides pour cette salle';
  END IF;

  IF _payment_method = 'espece' THEN
    -- Le client paie au guichet : sièges gardés jusqu'à 15 min avant la séance.
    hold_until := scr.starts_at - interval '15 minutes';
    IF hold_until < now() + interval '15 minutes' THEN
      RAISE EXCEPTION 'COUNTER_CLOSED'
        USING HINT = 'Paiement au guichet indisponible moins de 30 min avant la séance';
    END IF;
    IF (SELECT count(*) FROM public.bookings b
        WHERE b.user_id = uid AND b.status = 'en_attente_paiement'
          AND b.payment_method = 'espece' AND b.expires_at > now()) >= 2 THEN
      RAISE EXCEPTION 'TOO_MANY_PENDING'
        USING HINT = 'Vous avez déjà 2 réservations à payer au guichet';
    END IF;
  ELSE
    -- Paiement en ligne : 15 min pour finaliser.
    hold_until := LEAST(now() + interval '15 minutes', scr.starts_at);
  END IF;

  PERFORM public.release_expired_holds(_screening_id);

  amount := seat_count * scr.price;
  INSERT INTO public.bookings (user_id, screening_id, status, total_amount, payment_method, expires_at)
  VALUES (uid, _screening_id, 'en_attente_paiement', amount, _payment_method, hold_until)
  RETURNING id INTO new_booking;

  BEGIN
    INSERT INTO public.booking_seats (booking_id, screening_id, seat_id)
    SELECT new_booking, _screening_id, s FROM (SELECT DISTINCT unnest(_seat_ids) AS s) x;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'SEATS_TAKEN'
      USING HINT = 'Ces sièges viennent d''être réservés. Choisissez-en d''autres.';
  END;

  -- 96 bits aléatoires (gen_random_uuid() utilise un générateur cryptographique).
  code := 'BCDZ-' || upper(
    left(replace(gen_random_uuid()::text, '-', ''), 12) ||
    left(replace(gen_random_uuid()::text, '-', ''), 12)
  );
  INSERT INTO public.tickets (booking_id, qr_code) VALUES (new_booking, code);
  UPDATE public.bookings SET qr_code = code WHERE id = new_booking;

  RETURN QUERY SELECT new_booking, code, amount, hold_until;
END;
$$;

-- Confirme un paiement en ligne. Réservé au serveur (service_role) : à appeler
-- depuis le webhook du prestataire de paiement, après vérification de sa
-- signature, jamais depuis le navigateur.
CREATE OR REPLACE FUNCTION public.confirm_booking_payment(
  _booking_id uuid,
  _amount numeric,
  _reference text
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  bk record;
BEGIN
  SELECT * INTO bk FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF bk.status = 'confirme' THEN
    RETURN 'already_confirmed';
  END IF;
  IF bk.total_amount <> _amount THEN
    RETURN 'amount_mismatch';
  END IF;
  -- Paiement reçu après expiration : les sièges ont pu être revendus, il faut
  -- rembourser le client.
  IF bk.status = 'annule' OR bk.expires_at < now() THEN
    RETURN 'expired_refund_needed';
  END IF;

  UPDATE public.bookings
  SET status = 'confirme', paid_at = now(), payment_reference = _reference
  WHERE id = _booking_id;
  RETURN 'confirmed';
END;
$$;

-- Le client abandonne une réservation non payée (libère les sièges).
CREATE OR REPLACE FUNCTION public.cancel_pending_booking(_booking_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ok boolean;
BEGIN
  UPDATE public.bookings
  SET status = 'annule', cancelled_at = now(), cancel_reason = 'abandon'
  WHERE id = _booking_id AND user_id = auth.uid() AND status = 'en_attente_paiement'
  RETURNING true INTO ok;
  IF ok THEN
    DELETE FROM public.booking_seats WHERE booking_id = _booking_id;
  END IF;
  RETURN coalesce(ok, false);
END;
$$;

-- Contrôle d'un billet par un agent de guichet (affecté au cinéma via
-- cinema_staff) ou un administrateur. _collect_cash = true : l'agent encaisse
-- une réservation « paiement au guichet » et valide l'entrée.
CREATE OR REPLACE FUNCTION public.scan_ticket(_code text, _collect_cash boolean DEFAULT false)
RETURNS TABLE (outcome text, info text, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  uid uuid := auth.uid();
  is_admin boolean;
  tk record;
  label text;
BEGIN
  is_admin := public.has_role(uid, 'admin');
  IF uid IS NULL OR NOT (is_admin OR public.has_role(uid, 'agent_guichet')) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING HINT = 'Réservé aux agents de guichet';
  END IF;

  SELECT t.id AS ticket_id, t.scanned, t.scanned_at,
         b.id AS booking_id, b.status, b.total_amount,
         s.starts_at, m.title, m.duration_minutes, h.name AS hall_name,
         c.id AS cinema_id, c.name AS cinema_name
  INTO tk
  FROM public.tickets t
  JOIN public.bookings b ON b.id = t.booking_id
  JOIN public.screenings s ON s.id = b.screening_id
  JOIN public.movies m ON m.id = s.movie_id
  JOIN public.halls h ON h.id = s.hall_id
  JOIN public.cinemas c ON c.id = h.cinema_id
  WHERE t.qr_code = upper(trim(_code))
  FOR UPDATE OF t, b;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::text, NULL::numeric;
    RETURN;
  END IF;

  IF NOT is_admin AND NOT public.is_cinema_staff(uid, tk.cinema_id) THEN
    RETURN QUERY SELECT 'wrong_cinema'::text, tk.cinema_name, NULL::numeric;
    RETURN;
  END IF;

  label := tk.title || ' — ' || tk.hall_name || ' — ' ||
           to_char(tk.starts_at AT TIME ZONE 'Africa/Algiers', 'DD/MM HH24:MI');

  IF tk.status = 'annule' THEN
    RETURN QUERY SELECT 'cancelled'::text, label, NULL::numeric;
    RETURN;
  END IF;
  IF tk.scanned THEN
    RETURN QUERY SELECT 'used'::text,
      label || ' — scanné le ' || to_char(tk.scanned_at AT TIME ZONE 'Africa/Algiers', 'DD/MM HH24:MI'),
      NULL::numeric;
    RETURN;
  END IF;
  IF now() < tk.starts_at - interval '3 hours' THEN
    RETURN QUERY SELECT 'too_early'::text, label, NULL::numeric;
    RETURN;
  END IF;
  IF now() > tk.starts_at + make_interval(mins => tk.duration_minutes) THEN
    RETURN QUERY SELECT 'expired'::text, label, NULL::numeric;
    RETURN;
  END IF;

  IF tk.status = 'en_attente_paiement' THEN
    IF NOT _collect_cash THEN
      RETURN QUERY SELECT 'unpaid'::text, label, tk.total_amount;
      RETURN;
    END IF;
    UPDATE public.bookings
    SET status = 'confirme', paid_at = now(), payment_method = 'espece',
        payment_reference = 'GUICHET-' || uid::text
    WHERE id = tk.booking_id;
  END IF;

  UPDATE public.tickets SET scanned = true, scanned_at = now(), scanned_by = uid
  WHERE id = tk.ticket_id;

  RETURN QUERY SELECT 'ok'::text, label, NULL::numeric;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_holds(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_taken_seats(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_seats(uuid, uuid[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_booking_payment(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_pending_booking(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.scan_ticket(text, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.release_expired_holds(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_taken_seats(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_seats(uuid, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_pending_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scan_ticket(text, boolean) TO authenticated;
