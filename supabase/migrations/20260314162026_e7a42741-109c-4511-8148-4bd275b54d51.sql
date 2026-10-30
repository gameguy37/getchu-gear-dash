CREATE POLICY "Authenticated full access on clients"
ON public.clients
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);