export function fileResourceResponse(
  file: {
    data: Uint8Array;
    name: string;
    extension: string;
    mime: string;
    view: string;
    hash: string;
  },
  download: boolean,
) {
  const filename = encodeURIComponent(file.name).replace(
    /[!'()*]/g,
    (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase(),
  );
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `${download || file.view === "download" ? "attachment" : "inline"}; filename="nexus-original${file.extension}"; filename*=UTF-8''${filename}`,
      "Content-Length": String(file.data.length),
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy":
        "base-uri 'none'; frame-ancestors 'self'; form-action 'none'",
      "Accept-Ranges": "none",
      "X-Nexus-Content-SHA256": file.hash,
    },
  });
}
