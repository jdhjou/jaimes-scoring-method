import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Completing sign-in…</div>}>
      <CallbackClient />
    </Suspense>
  );
}
