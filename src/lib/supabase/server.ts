import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createClient() {
  // Next.js 16: cookies() is async (returns Promise)
  const cookieStore: any = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, key, {
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
          // Server Components may not be able to set cookies; middleware/proxy handles it.
        }
      },
    },
  });
}
