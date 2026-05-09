import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage() {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  if (orgs.length > 0) redirect("/dashboard");
  return <OnboardingForm />;
}
