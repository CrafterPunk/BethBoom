import { redirect } from "next/navigation";

import { readSession } from "@/lib/auth/session";

export default async function AccessPage() {
  const session = await readSession();
  if (session) {
    redirect("/dashboard");
  }

  redirect("/public/markets");
}
