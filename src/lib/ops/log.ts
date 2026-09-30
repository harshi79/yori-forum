// Never log exception messages/stacks: database errors can include private values.
export function logOperationalError(event: string, error: unknown) {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      at: new Date().toISOString(),
      type: error instanceof Error ? error.name : "UnknownError",
    }),
  );
}
