const BASE64_CHUNK_SIZE = 0x8000;

export function getSplatMapFilename(index: number): string {
  return index === 0 ? "splatmap.png" : `splatmap_${index}.png`;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const slice = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE);
    chunks.push(String.fromCharCode(...slice));
  }

  return btoa(chunks.join(""));
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}