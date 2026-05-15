// Base64 helpers for browser-safe binary persistence.
// Base64 辅助函数，用于浏览器安全的二进制持久化。

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;

  // EN: Build the binary string in chunks to avoid call-stack limits on large project sidecars.
  // 中文: 分块构造二进制字符串，避免大型项目 sidecar 触发调用栈限制。
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    chunks.push(String.fromCharCode(...slice));
  }

  return btoa(chunks.join(""));
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}