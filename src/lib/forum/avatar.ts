import { ForumError } from "./permissions";
export const MAX_AVATAR_BYTES = 1024 * 1024;
export function avatarType(
  bytes: Uint8Array,
  claimed: string,
): "image/png" | "image/jpeg" | "image/webp" {
  if (bytes.length < 16 || bytes.length > MAX_AVATAR_BYTES)
    throw new ForumError("Avatar must be between 16 bytes and 1 MB");
  const png = bytes
    .slice(0, 8)
    .every((b, i) => b === [137, 80, 78, 71, 13, 10, 26, 10][i]);
  const jpeg =
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[bytes.length - 2] === 255 &&
    bytes[bytes.length - 1] === 217;
  const webp =
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  const detected = png
    ? "image/png"
    : jpeg
      ? "image/jpeg"
      : webp
        ? "image/webp"
        : null;
  if (!detected || claimed !== detected)
    throw new ForumError("Only PNG, JPEG or WebP images are allowed");
  return detected;
}
export async function readAvatar(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ForumError("Missing image");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AVATAR_BYTES) throw new ForumError("Avatar exceeds 1 MB");
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return {
    bytes: result,
    type: avatarType(result, request.headers.get("content-type") ?? ""),
  };
}
// Minimal R2 surface; avoids Node SDK and keeps runtime-specific bindings at the boundary.
export interface AvatarBucket {
  put(
    key: string,
    data: Uint8Array,
    options: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream;
    httpMetadata?: { contentType?: string };
  } | null>;
  delete(key: string): Promise<void>;
}
export async function avatarBucket(): Promise<AvatarBucket | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as { AVATARS?: AvatarBucket }).AVATARS ?? null;
  } catch {
    return null;
  }
}
export function avatarKey(userId: string, type: string) {
  return `avatars/${userId}/${crypto.randomUUID()}.${type.split("/")[1]}`;
}
