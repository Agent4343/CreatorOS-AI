import { Suspense } from "react";
import AcceptInviteClient from "./AcceptInviteClient";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Loading…</div>}>
      <AcceptInviteClient />
    </Suspense>
  );
}
