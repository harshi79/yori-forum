"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function RefreshUnread() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
