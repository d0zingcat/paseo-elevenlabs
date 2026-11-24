export interface MultipartFile {
  fieldName: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface ParsedMultipart {
  fields: Map<string, string[]>;
  files: Map<string, MultipartFile[]>;
}

export function firstField(parsed: ParsedMultipart, name: string): string | undefined {
  return parsed.fields.get(name)?.[0];
}

export function firstFile(parsed: ParsedMultipart, name: string): MultipartFile | undefined {
  return parsed.files.get(name)?.[0];
}

/**
 * Minimal multipart/form-data parser. Handles the shape Paseo's OpenAI STT
 * client sends: text fields plus one audio `file` part. Values are kept in
 * memory; the shim rejects oversized bodies before parsing.
 */
export function parseMultipart(body: Buffer, boundary: string): ParsedMultipart {
  const fields = new Map<string, string[]>();
  const files = new Map<string, MultipartFile[]>();
  const delimiter = Buffer.from("--" + boundary);
  const parts: { headers: string; data: Buffer }[] = [];

  let cursor = 0;
  while (cursor < body.length) {
    const start = body.indexOf(delimiter, cursor);
    if (start === -1) break;
    let pos = start + delimiter.length;
    // Final boundary ends with "--".
    if (body[pos] === 0x2d && body[pos + 1] === 0x2d) break;
    // Skip CRLF after the delimiter.
    if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;
    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), pos);
    if (headerEnd === -1) break;
    const headers = body.subarray(pos, headerEnd).toString("latin1");
    const dataStart = headerEnd + 4;
    let dataEnd = body.indexOf(delimiter, dataStart);
    if (dataEnd === -1) dataEnd = body.length;
    // Trim the CRLF that precedes the next delimiter.
    let end = dataEnd;
    if (end >= 2 && body[end - 2] === 0x0d && body[end - 1] === 0x0a) end -= 2;
    parts.push({ headers, data: body.subarray(dataStart, end) });
    cursor = dataEnd;
  }

  for (const part of parts) {
    const disposition = part.headers
      .split("\r\n")
      .find((line) => line.toLowerCase().startsWith("content-disposition:"));
    if (!disposition) continue;
    const nameMatch = disposition.match(/name="([^"]*)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const filenameMatch = disposition.match(/filename="([^"]*)"/);
    if (filenameMatch) {
      const typeLine = part.headers
        .split("\r\n")
        .find((line) => line.toLowerCase().startsWith("content-type:"));
      const contentType = typeLine ? typeLine.split(":").slice(1).join(":").trim() : "application/octet-stream";
      const file: MultipartFile = {
        fieldName: name,
        filename: filenameMatch[1] || "audio",
        contentType,
        data: Buffer.from(part.data),
      };
      const list = files.get(name) ?? [];
      list.push(file);
      files.set(name, list);
    } else {
      const value = part.data.toString("utf8");
      const list = fields.get(name) ?? [];
      list.push(value);
      fields.set(name, list);
    }
  }

  return { fields, files };
}

export function extractBoundary(contentType: string | undefined): string | null {
  if (!contentType) return null;
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) return null;
  return (match[1] ?? match[2] ?? "").trim();
}
