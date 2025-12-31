import React, { Suspense } from "react";
import InsightsClient from "./InsightsClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <InsightsClient />
    </Suspense>
  );
}
