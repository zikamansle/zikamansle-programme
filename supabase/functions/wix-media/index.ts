import { createSupabaseContext } from "npm:@supabase/server@1";

const ADMIN_ID = "7355541f-da9c-466f-b5ee-641da466f76d";
const ORIGIN = "https://zikamansle.github.io";
const CORS = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" }
});

export default {
  async fetch(req: Request) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "POST") return respond({ error: "Méthode refusée" }, 405);
    try {
      const { data, error } = await createSupabaseContext(req, { auth: "user" });
      if (error || !data?.userClaims) return respond({ error: "Connexion requise" }, 401);
      const uid = data.userClaims.sub ?? data.userClaims.id;
      if (uid !== ADMIN_ID) return respond({ error: "Accès refusé" }, 403);
      const apiKey = Deno.env.get("WIX_API_KEY");
      const siteId = Deno.env.get("WIX_SITE_ID");
      if (!apiKey || !siteId) return respond({ error: "Secrets Wix manquants" }, 500);
      const wixHeaders = { "Authorization": apiKey, "wix-site-id": siteId, "Content-Type": "application/json", "Accept": "application/json" };
      const input = await req.json().catch(() => ({}));
      const action = String(input.action || "search");
      async function wix(path: string, method: string, payload?: unknown) {
        const r = await fetch("https://www.wixapis.com" + path, {
          method, headers: wixHeaders, ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
        });
        const raw = await r.text();
        let body: any;
        try { body = JSON.parse(raw); } catch { body = {}; }
        if (!r.ok) {
          console.error("WIX MEDIA", { action, status: r.status, code: body.errorCode, message: body.message });
          throw new Error("Wix HTTP " + r.status + " : " + (body.message || "Opération refusée"));
        }
        return body;
      }
      if (action === "search") {
        const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 100);
        const paging: Record<string, unknown> = { limit };
        if (typeof input.cursor === "string" && input.cursor.length < 16000 && input.cursor) paging.cursor = input.cursor;
        const payload: any = { rootFolder: "MEDIA_ROOT", paging, sort: { fieldName: "updatedDate", order: "DESC" } };
        if (typeof input.search === "string" && input.search.trim()) payload.search = input.search.trim().slice(0, 200);
        if (["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "VECTOR", "ARCHIVE", "MODEL3D"].includes(input.mediaType)) payload.mediaTypes = [input.mediaType];
        // Wix Search Files: omit `private` to include the entire library.
        const result = await wix("/site-media/v1/files/search", "POST", payload);
        const rawCursor = result.nextCursor ?? result.pagingMetadata?.cursors?.next ?? result.pagingMetadata?.nextCursor ?? null;
        const cursorCandidates = [
          result.nextCursor?.cursors?.next, result.nextCursor?.cursor,
          result.nextCursor?.nextCursor, result.nextCursor,
          result.pagingMetadata?.cursors?.next, result.pagingMetadata?.nextCursor
        ];
        const nextCursor = cursorCandidates.find((v: unknown) =>
          typeof v === "string" && v.length > 0 && v.length <= 16000
        ) ?? null;
        console.info("WIX PAGINATION", { received: result.files?.length ?? 0, requestedLimit: limit, hasMore: Boolean(nextCursor), cursorShape: rawCursor === null ? "null" : typeof rawCursor, responseKeys: Object.keys(result), nextCursorKeys: rawCursor && typeof rawCursor === "object" ? Object.keys(rawCursor) : [] });
        return respond({ files: result.files || [], nextCursor, hasMore: Boolean(nextCursor) });
      }
      if (action === "folders") {
        // List folders is limited to the requested parent, default root.
        const parent = typeof input.parentFolderId === "string" ? input.parentFolderId : "";
        const qs = parent ? "?parentFolderId=" + encodeURIComponent(parent) : "";
        const result = await wix("/site-media/v1/folders" + qs, "GET");
        return respond({ folders: result.folders || [] });
      }
      if (action === "prepare-upload") {
        // Le fichier lui-même ne transite jamais par Supabase.
        const fileName = String(input.name || "").trim();
        const mimeType = String(input.mimeType || "").trim();
        const size = Number(input.size);
        if (!fileName || fileName.length > 180 || /[\\/\x00-\x1F]/.test(fileName) ||
            !/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(mimeType) ||
            !Number.isSafeInteger(size) || size <= 0)
          return respond({ error: "Fichier, format ou taille invalide" }, 400);
        const resumable = size > 10_000_000;
        const body: Record<string, unknown> = { fileName, mimeType };
        if (resumable) { body.sizeInBytes = String(size); body.uploadProtocol = "TUS"; }
        if (typeof input.parentFolderId === "string" && input.parentFolderId && input.parentFolderId.length < 100) body.parentFolderId = input.parentFolderId;
        const path = resumable ? "/site-media/v1/files/generate-resumable-upload-url" : "/site-media/v1/files/generate-upload-url";
        const result = await wix(path, "POST", body);
        // Wix documente uploadUrl et uploadToken au premier niveau.
        // Accepter également certaines enveloppes de réponse, sans exposer les secrets.
        const envelope = [result, result.data, result.result, result.resumableUpload, result.upload].find(
          (candidate: any) => candidate && typeof candidate.uploadUrl === "string"
        ) || result;
        const url = envelope.uploadUrl;
        const token = envelope.uploadToken ?? result.uploadToken;
        if (typeof url !== "string" || !/^https:\/\/[^/]*\.wix(?:mp|static)\.com\//i.test(url)) {
          console.error("WIX PREPARE SHAPE", { hasUrl: Boolean(url), responseKeys: Object.keys(result), nestedKeys: Object.keys(envelope) });
          return respond({ error: "Wix n'a pas renvoyé d'URL de transfert valide", stage: "prepare" }, 502);
        }
        if (resumable && (typeof token !== "string" || !token.trim() || token.length > 16000)) {
          console.error("WIX PREPARE TOKEN MISSING", { responseKeys: Object.keys(result), nestedKeys: Object.keys(envelope), tokenType: typeof token, tokenLength: typeof token === "string" ? token.length : null, tokenEmpty: typeof token === "string" ? !token.trim() : null });
          return respond({
            error: "Wix ne fournit pas le jeton TUS nécessaire à l'importation des vidéos volumineuses. Transfert non démarré.",
            stage: "prepare",
            responseFields: Object.keys(result).filter((k) => !/token|secret|authorization|key|url/i.test(k)).slice(0,15)
          }, 502);
        }
        return respond({ uploadUrl: url, uploadToken: resumable ? token : null, resumable });
      }
      if (action === "finalize-upload") {
        // Le jeton signé est émis par Wix ; le serveur effectue la finalisation.
        const url = String(input.uploadUrl || "");
        const tok = String(input.uploadToken || "");
        const fileName = String(input.name || "");
        const validWixUrl = /^https:\/\/[^/]*\.wix(?:mp|static)\.com\//i.test(url);
        const validToken = tok.length > 0 && tok.length <= 16000;
        const validName = fileName.length > 0 && fileName.length <= 180;
        if (!validWixUrl || !validToken || !validName) {
          // Ne jamais écrire l'URL signée ou le jeton dans les logs.
          const reason = !validWixUrl ? "URL Wix non reconnue" : !validToken ? "Jeton Wix manquant ou invalide" : "Nom du fichier invalide";
          console.error("WIX FINALIZE VALIDATION", { validWixUrl, validToken, validName });
          return respond({ error: "Finalisation invalide : " + reason }, 400);
        }
        const end = url.replace(/\/$/, "") + "/" + encodeURIComponent(tok) + "?filename=" + encodeURIComponent(fileName);
        const r = await fetch(end, { method: "PUT", redirect: "error" });
        const raw = await r.text();
        let details: any = {};
        try { details = raw ? JSON.parse(raw) : {}; } catch { details = {}; }
        if (!r.ok) {
          console.error("WIX FINALIZE ERROR", { status: r.status, message: details.message || null, code: details.errorCode || null });
          return respond({ error: "Finalisation Wix refusée (HTTP " + r.status + ")", status: r.status }, 502);
        }
        const descriptor = details.file || details.fileInfo || details;
        const fileId = descriptor.id || descriptor.fileId || details.fileId || null;
        const operationStatus = descriptor.operationStatus || descriptor.state || null;
        console.info("WIX FINALIZE RESULT", { httpStatus: r.status, hasFileId: !!fileId, operationStatus, responseKeys: Object.keys(details).slice(0, 12) });
        if (!fileId || typeof fileId !== "string") {
          return respond({ finalized: false, error: "Wix a accepté la finalisation mais n'a renvoyé aucun identifiant de média. Le fichier n'est pas confirmé dans la bibliothèque.", uploadAccepted: true }, 502);
        }
        return respond({ finalized: true, fileId, operationStatus, file: descriptor });
      }
      if (action === "check-upload") {
        const fileId = typeof input.fileId === "string" ? input.fileId : "";
        if (!fileId || fileId.length > 1000) return respond({error:"Identifiant de média invalide"},400);
        const check = await fetch("https://www.wixapis.com/site-media/v1/files/get-file-by-id?fileId=" + encodeURIComponent(fileId), {headers:wixHeaders});
        const raw = await check.text();
        let result: any = {};
        try {result = JSON.parse(raw)} catch {}
        if (!check.ok) {
          console.info("WIX CHECK FILE",{status:check.status, found:false});
          if (check.status === 404) return respond({found:false,ready:false});
          return respond({error:"Vérification Wix refusée (HTTP "+check.status+")"},502);
        }
        const file = result.file || result.fileInfo || result;
        const state = String(file.operationStatus || file.state || "UNKNOWN").toUpperCase();
        const failed = ["FAILED","ERROR"].includes(state);
        const ready = ["READY","OK"].includes(state);
        console.info("WIX CHECK FILE",{found:!!file.id,state});
        return respond({found:!!file.id,ready,failed,state,fileId:file.id||fileId});
      }
      return respond({ error: "Action inconnue" }, 400);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur serveur";
      console.error("WIX MEDIA ERROR", message);
      return respond({ error: message }, 502);
    }
  }
};
