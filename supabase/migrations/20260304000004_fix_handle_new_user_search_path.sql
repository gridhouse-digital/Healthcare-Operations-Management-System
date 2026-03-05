-- Fix: handle_new_user() trigger was missing SET search_path = public.
-- GoTrue runs with a restricted search_path (auth schema only), so the trigger
-- could not resolve the user_role enum type which lives in public schema.
-- Adding SET search_path = public fixes user creation via the auth admin API.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'first_name',
        NEW.raw_user_meta_data->>'last_name',
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'staff'::user_role)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
