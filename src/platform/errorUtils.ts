export function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    const serialized = JSON.stringify(error);
    return serialized ?? String(error);
  } catch {
    return String(error);
  }
}

export function isMissingFileSystemResourceError(error: unknown): boolean {
  const message = formatUnknownError(error).toLowerCase();
  return (
    message.includes("not found")
    || message.includes("does not exist")
    || message.includes("no such file")
    || message.includes("os error 2")
    || message.includes("enoent")
  );
}