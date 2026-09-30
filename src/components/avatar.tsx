export function Avatar({
  id,
  name,
  stored,
  size = 36,
}: {
  id: string;
  name: string;
  stored?: string | null;
  size?: number;
}) {
  if (stored?.startsWith(`avatars/${id}/`)) {
    // Images are validated at upload and served through an image-only R2 proxy.
    /* eslint-disable @next/next/no-img-element -- image proxy intentionally serves validated R2 bytes */
    return (
      <img
        src={`/api/avatar/${encodeURIComponent(id)}`}
        alt={`${name}'s avatar`}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
    /* eslint-enable @next/next/no-img-element */
  }
  return (
    <span
      aria-label={`${name}'s avatar`}
      className="grid shrink-0 place-items-center rounded-full bg-violet-400/20 text-violet-200"
      style={{ width: size, height: size }}
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}
