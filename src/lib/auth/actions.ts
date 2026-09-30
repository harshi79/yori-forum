"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./server";
export async function signOutAction() {
  const client = await createSupabaseServerClient();
  await client.auth.signOut();
  redirect("/login");
}
