REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.halls_autoseat() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_seats_for_hall(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_cinema_staff(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_staff_of_hall(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_cinema_staff(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff_of_hall(uuid, uuid) TO authenticated;