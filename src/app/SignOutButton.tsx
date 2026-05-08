"use client";

export function SignOutButton() {
  return (
    <button
      type="button"
      className="text-xs text-muted underline"
      onClick={async () => {
        await fetch("/api/auth", { method: "DELETE" });
        window.location.href = "/login";
      }}
    >
      Sign out
    </button>
  );
}
