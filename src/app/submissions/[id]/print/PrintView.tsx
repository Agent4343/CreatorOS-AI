"use client";

import type {
  FormDefinition,
  FormField,
  SignatureRow,
  Submission,
} from "@/lib/types";

/**
 * Print-styled completed submission. Most browsers' "Save as PDF" in
 * the print dialog produces a clean compliance-grade artifact from
 * this page.
 *
 * Print CSS hides the action toolbar and removes screen-only chrome
 * so the resulting PDF is just the form.
 */
export default function PrintView({
  submission,
  schema,
  signatures,
  photoUrls,
  orgName,
  formName,
  viaToken = false,
}: {
  submission: Submission;
  schema: FormDefinition;
  signatures: SignatureRow[];
  photoUrls: Record<string, string>;
  orgName: string;
  formName: string;
  viaToken?: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 print:p-0">
      <PrintStyles />

      <div className="no-print mb-6 flex flex-wrap items-center gap-3 rounded-md border border-ink/15 bg-bg p-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-ink px-4 py-2 text-sm text-bg"
        >
          Print / Save as PDF
        </button>
        {!viaToken && (
          <a
            href={`/submissions/${submission.id}`}
            className="text-sm text-ink no-underline"
          >
            ← back to submission
          </a>
        )}
        <span className="ml-auto text-xs text-muted">
          Use your browser's print dialog → "Save as PDF" for a
          downloadable file.
        </span>
      </div>

      {/* Header that prints */}
      <header className="border-b-2 border-ink pb-3">
        <div className="text-xs font-mono uppercase tracking-wider text-muted">
          {orgName}
        </div>
        <h1 className="mt-1 text-2xl font-bold">{formName}</h1>
        <div className="mt-2 grid gap-1 text-xs text-ink/80 md:grid-cols-2">
          <div>
            <span className="text-muted">Submission ID:</span>{" "}
            <span className="font-mono">{submission.id}</span>
          </div>
          <div>
            <span className="text-muted">Status:</span>{" "}
            <strong>{submission.status}</strong>
          </div>
          <div>
            <span className="text-muted">Started:</span>{" "}
            {new Date(submission.created_at).toLocaleString()}
          </div>
          <div>
            <span className="text-muted">Completed:</span>{" "}
            {submission.completed_at
              ? new Date(submission.completed_at).toLocaleString()
              : "—"}
          </div>
        </div>
      </header>

      {/* Each section + its filled-in fields */}
      <main className="mt-6 space-y-6">
        {schema.sections.map((sec) => (
          <section key={sec.id} className="break-inside-avoid">
            <h2 className="border-b border-ink/30 pb-1 text-base font-bold uppercase tracking-wider">
              {sec.title}
            </h2>
            <div className="mt-2 space-y-3">
              {sec.fields.map((f) => (
                <FieldDisplay
                  key={f.id}
                  field={f}
                  value={submission.data?.[f.id]}
                  photoUrls={photoUrls}
                  signature={signatures.find((s) => s.field_id === f.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* Audit trail footer — required for compliance */}
      {signatures.length > 0 && (
        <section className="mt-8 break-inside-avoid border-t-2 border-ink pt-4">
          <h2 className="text-sm font-bold uppercase tracking-wider">
            Signature audit trail
          </h2>
          <p className="mt-1 text-xs text-muted">
            Each signature below is bound to a SHA-256 hash of the
            submission data at the moment of signing. Modifying the form
            after signing breaks the hash on recompute — tamper-evident
            under 21 CFR Part 11 / eIDAS / ESIGN.
          </p>
          <table className="mt-3 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-ink/30 text-left">
                <th className="py-1 pr-2">Signer</th>
                <th className="py-1 pr-2">Signed at (UTC)</th>
                <th className="py-1 pr-2">IP</th>
                <th className="py-1">Hash</th>
              </tr>
            </thead>
            <tbody>
              {signatures.map((sig) => (
                <tr key={sig.id} className="border-b border-ink/10 align-top">
                  <td className="py-1 pr-2">
                    {sig.signer_name}
                    <br />
                    <span className="text-[10px] text-muted">
                      {sig.signer_email}
                    </span>
                  </td>
                  <td className="py-1 pr-2 font-mono text-[10px]">
                    {new Date(sig.signed_at).toISOString()}
                  </td>
                  <td className="py-1 pr-2 font-mono text-[10px]">
                    {sig.ip_address ?? "—"}
                  </td>
                  <td className="py-1 break-all font-mono text-[9px]">
                    {sig.data_hash}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {signatures.some((s) => s.geolocation) && (
            <div className="mt-2 text-[10px] text-muted">
              Geolocations:{" "}
              {signatures
                .filter((s) => s.geolocation)
                .map(
                  (s) =>
                    `${s.signer_name}: ${s.geolocation!.lat.toFixed(5)}, ${s.geolocation!.lng.toFixed(5)}`,
                )
                .join(" · ")}
            </div>
          )}
        </section>
      )}

      <footer className="mt-8 border-t border-ink/10 pt-3 text-[10px] text-muted">
        Generated by FieldForm at {new Date().toISOString()}.
      </footer>
    </div>
  );
}

function FieldDisplay({
  field,
  value,
  photoUrls,
  signature,
}: {
  field: FormField;
  value: unknown;
  photoUrls: Record<string, string>;
  signature?: SignatureRow;
}) {
  if (field.type === "section_header") {
    return <h3 className="text-sm font-bold uppercase">{field.label}</h3>;
  }
  if (field.type === "divider") {
    return <hr className="border-ink/20" />;
  }

  const labelEl = (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
      {field.label}
      {field.required && <span className="ml-1 text-ink">*</span>}
    </div>
  );

  // Signature is special — render the actual image and audit row inline.
  if (field.type === "signature") {
    return (
      <div>
        {labelEl}
        {signature ? (
          <div className="mt-1 rounded-md border border-ink/30 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signature.signature_image}
              alt={`Signature of ${signature.signer_name}`}
              className="max-h-24 w-auto"
            />
            <div className="mt-1 text-[10px] text-ink/80">
              <strong>{signature.signer_name}</strong> ·{" "}
              {new Date(signature.signed_at).toLocaleString()}
              {signature.ip_address && (
                <span className="ml-1 font-mono text-muted">
                  · {signature.ip_address}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-1 italic text-muted">— Not signed —</div>
        )}
      </div>
    );
  }

  if (field.type === "photo") {
    const paths = (value as string[] | undefined) ?? [];
    return (
      <div>
        {labelEl}
        {paths.length === 0 ? (
          <div className="mt-1 italic text-muted">— No photos —</div>
        ) : (
          <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-3">
            {paths.map((p) => (
              <div
                key={p}
                className="overflow-hidden rounded-md border border-ink/15"
              >
                {photoUrls[p] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={photoUrls[p]}
                    alt=""
                    className="h-32 w-full object-cover"
                  />
                ) : (
                  <div className="h-32 w-full bg-ink/5 text-center text-[10px] text-muted">
                    (image unavailable)
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (field.type === "gps") {
    const v = value as { lat: number; lng: number } | undefined;
    return (
      <div>
        {labelEl}
        <div className="mt-1 font-mono text-xs">
          {v ? `${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}` : "—"}
        </div>
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-sm">{value ? "☑" : "☐"}</span>
        <span className="text-sm">{field.label}</span>
      </div>
    );
  }

  if (field.type === "multi_select") {
    const arr = (value as string[] | undefined) ?? [];
    return (
      <div>
        {labelEl}
        <div className="mt-1 text-sm">
          {arr.length > 0 ? arr.join(", ") : "—"}
        </div>
      </div>
    );
  }

  // text, textarea, number, date, datetime, dropdown, radio, timestamp
  let displayValue = "";
  if (value == null || value === "") {
    displayValue = "—";
  } else if (field.type === "datetime" || field.type === "timestamp") {
    try {
      displayValue = new Date(value as string).toLocaleString();
    } catch {
      displayValue = String(value);
    }
  } else if (field.type === "date") {
    displayValue = String(value);
  } else {
    displayValue = String(value);
  }

  return (
    <div>
      {labelEl}
      <div className="mt-1 whitespace-pre-wrap text-sm">{displayValue}</div>
    </div>
  );
}

function PrintStyles() {
  return (
    <style>{`
      @media print {
        @page { margin: 1in; }
        body { background: white !important; }
        .no-print { display: none !important; }
        a { color: black !important; text-decoration: none !important; }
      }
      @media screen {
        body { background: #f8fafc; }
      }
      .break-inside-avoid { break-inside: avoid; }
    `}</style>
  );
}
