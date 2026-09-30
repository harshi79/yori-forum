"use client";
import { useEffect } from "react";
export function RecordView({ id }: { id: string }) {
  useEffect(() => {
    const key = `view:${id}`;
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last > 1800000) {
      sessionStorage.setItem(key, String(Date.now()));
      void fetch(`/api/views/${encodeURIComponent(id)}`, { method: "POST" });
    }
  }, [id]);
  return null;
}
