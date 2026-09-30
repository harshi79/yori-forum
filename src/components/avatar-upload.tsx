"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { input, button } from "./forum";
export function AvatarUpload() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = new FormData(e.currentTarget).get("avatar");
    if (!(file instanceof File) || !file.size || file.size > 1024 * 1024) {
      setMessage("Select an image under 1 MB.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const data = await response.json();
      setMessage(data.error ?? "Avatar updated.");
      if (response.ok) router.refresh();
    } catch {
      setMessage("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      const response = await fetch("/api/avatar", { method: "DELETE" });
      const data = await response.json();
      setMessage(data.error ?? "Avatar removed.");
      if (response.ok) router.refresh();
    } catch {
      setMessage("Could not remove avatar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold">Avatar</h2>
      <p className="text-sm text-slate-400">
        PNG, JPEG or WebP · up to 1 MB. An initial is shown when you have no
        image.
      </p>
      <form onSubmit={upload} className="flex flex-wrap items-center gap-3">
        <input
          className={`${input} max-w-sm`}
          name="avatar"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
        />
        <button className={button} disabled={busy}>
          Upload
        </button>
      </form>
      <button
        onClick={remove}
        disabled={busy}
        className="text-sm text-rose-300"
      >
        Remove avatar
      </button>
      <p role="status" className="text-sm text-violet-300">
        {message}
      </p>
    </section>
  );
}
