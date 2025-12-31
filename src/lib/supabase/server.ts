import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_COOKIE_NAME } from "./constants";

export async function createClient() {
  const cookieStore: any = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, key, {
    cookieOptions: { name: SUPABASE_COOKIE_NAME },
    cookies: {
      getAll() {
        return cookieStore.getAll ? cookieStore.getAll() : [];
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }: any) => {
            if (cookieStore.set) cookieStore.set(name, value, options);
          });
        } catch {
          // ignore
        }
      },
    },
  });
}
