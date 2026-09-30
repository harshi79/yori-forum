"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./server";
import { logOperationalError } from "@/lib/ops/log";
export async function signOutAction() {
  const client = await createSupabaseServerClient();
  const { error } = await client.auth.signOut();
  if (error) {
    logOperationalError("auth.signout", error);
    throw new Error("Sign-out unavailable. Please try again.");
  }
  redirect("/login");
}
