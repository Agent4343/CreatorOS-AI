import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
import ImportClient from "./ImportClient";

export default async function ImportPage() {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  if (orgs.length === 0) redirect("/onboarding");
  const { org, role } = orgs[0];
  if (role !== "owner" && role !== "admin") redirect("/forms");
  return <ImportClient orgId={org.id} />;
}
