import { redirect } from "next/navigation";

import { readSession } from "@/lib/auth/session";

import { AccessForm } from "./access-form";

export default async function AccessPage() {
  const session = await readSession();
  if (session) {
    redirect("/dashboard");
  }

  return <AccessForm />;
}