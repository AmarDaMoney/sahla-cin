CREATE POLICY "posters public read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'posters');
CREATE POLICY "posters admin insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'posters' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "posters admin update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'posters' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "posters admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'posters' AND public.has_role(auth.uid(),'admin'));