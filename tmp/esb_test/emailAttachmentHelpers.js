var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var emailAttachmentHelpers_exports = {};
__export(emailAttachmentHelpers_exports, {
  buildDocumentGalleryEmailAttachments: () => buildDocumentGalleryEmailAttachments,
  buildProfileDocumentGalleryAttachments: () => buildProfileDocumentGalleryAttachments,
  collectProfileDocumentSources: () => collectProfileDocumentSources
});
module.exports = __toCommonJS(emailAttachmentHelpers_exports);
var import_supabaseFailover = require("./supabaseFailover");
var import_entityDocumentStorage = require("./entityDocumentStorage");
var import_entityDocumentDatabase = require("./entityDocumentDatabase");
function extFromMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("gif")) return "gif";
  if (m.includes("bmp")) return "bmp";
  if (m.includes("tiff") || m.includes("tif")) return "tiff";
  if (m.includes("svg")) return "svg";
  if (m.includes("heic") || m.includes("heif")) return "heic";
  if (m.includes("msword") || m.includes("application/word")) return "doc";
  if (m.includes("openxmlformats-officedocument.wordprocessingml")) return "docx";
  if (m.includes("excel") || m.includes("spreadsheetml.sheet")) return "xlsx";
  if (m.includes("vnd.ms-excel")) return "xls";
  if (m.includes("powerpoint") || m.includes("presentationml.presentation")) return "pptx";
  if (m.includes("vnd.ms-powerpoint")) return "ppt";
  if (m.includes("rtf")) return "rtf";
  if (m.includes("plain") || m.includes("text/") && !m.includes("html") && !m.includes("csv")) return "txt";
  if (m.includes("csv")) return "csv";
  if (m.includes("html") || m.includes("htm")) return "html";
  if (m.includes("zip") || m.includes("compressed")) return "zip";
  if (m.includes("rar")) return "rar";
  if (m.includes("7z") || m.includes("7-zip")) return "7z";
  if (m.includes("tar")) return "tar";
  if (m.includes("gz") || m.includes("gzip")) return "gz";
  if (m.includes("mp3") || m.includes("mpeg") && m.includes("audio")) return "mp3";
  if (m.includes("mp4") || m.includes("video/mp4")) return "mp4";
  if (m.includes("wav")) return "wav";
  if (m.includes("avi")) return "avi";
  if (m.includes("mov") || m.includes("quicktime")) return "mov";
  if (m.includes("json")) return "json";
  if (m.includes("xml")) return "xml";
  if (m.includes("vcard") || m.includes("vcf")) return "vcf";
  if (m.includes("ics")) return "ics";
  return "";
}
function extFromMagicBytes(buffer) {
  let bytes;
  if (typeof buffer === "string") {
    try {
      const b64 = buffer.includes(",") ? buffer.split(",")[1] : buffer;
      const binary = atob(b64);
      const len = Math.min(binary.length, 16);
      bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    } catch {
      return "";
    }
  } else if (Buffer.isBuffer(buffer)) {
    const len = Math.min(buffer.length, 16);
    bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = buffer[i];
  } else {
    const len = Math.min(buffer.length, 16);
    bytes = buffer.slice(0, len);
  }
  const b = bytes;
  if (b.length >= 4 && b[0] === 37 && b[1] === 80 && b[2] === 68 && b[3] === 70) return "pdf";
  if (b.length >= 8 && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71 && b[4] === 13 && b[5] === 10 && b[6] === 26 && b[7] === 10) return "png";
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return "jpg";
  if (b.length >= 6 && (b[0] === 71 && b[1] === 73 && b[2] === 70 && b[3] === 56 && (b[4] === 55 || b[4] === 57) && b[5] === 97)) return "gif";
  if (b.length >= 12 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80) return "webp";
  if (b.length >= 2 && b[0] === 66 && b[1] === 77) return "bmp";
  if (b.length >= 4 && b[0] === 80 && b[1] === 75 && b[2] === 3 && b[3] === 4) return "zip";
  if (b.length >= 8 && b[0] === 82 && b[1] === 97 && b[2] === 114 && b[3] === 33 && b[4] === 26 && b[5] === 7 && (b[6] === 0 || b[6] === 1)) return "rar";
  if (b.length >= 3 && b[0] === 31 && b[1] === 139 && b[2] === 8) return "gz";
  if (b.length >= 6 && b[0] === 117 && b[1] === 115 && b[2] === 116 && b[3] === 97 && b[4] === 114) return "tar";
  if (b.length >= 4 && (b[0] === 73 && b[1] === 73 && b[2] === 42 && b[3] === 0) || b[0] === 77 && b[1] === 77 && b[2] === 0 && b[3] === 42) return "tiff";
  if (b.length >= 3 && (b[0] === 73 && b[1] === 68 && b[2] === 51) || b[0] === 73 && b[1] === 68 && b[2] === 50) return "mp3";
  if (b.length >= 12 && b[4] === 102 && b[5] === 116 && b[6] === 121 && b[7] === 112) return "mp4";
  if (b.length >= 4 && b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70) return "wav";
  if (b.length >= 8 && (b[0] === 48 || b[0] === 49 || b[0] === 50) && b[1] === 0 && b[2] === 0 && b[3] === 0 && (b[4] === 102 && b[5] === 116 && b[6] === 121 && b[7] === 112)) return "mov";
  return "";
}
function resolveExtension(mime, buffer, fallbackPathExt) {
  const BLOCKED_EXTS = /* @__PURE__ */ new Set(["bin", "exe", "bat", "cmd", "com", "scr", "pif", "vbs", "js", "msi", "reg", "ps1"]);
  if (fallbackPathExt && !BLOCKED_EXTS.has(fallbackPathExt.toLowerCase())) return fallbackPathExt.toLowerCase();
  const fromMime = extFromMime(mime);
  if (fromMime) return fromMime;
  if (buffer) {
    const fromMagic = extFromMagicBytes(buffer);
    if (fromMagic) return fromMagic;
  }
  return "dat";
}
function safeFilenamePart(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "Document";
}
function isDocumentUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  return value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/api/supabase/file") || value.includes(".pdf") || value.length > 100;
}
function resolveDocumentSourceUrl(source) {
  if (source.url && isDocumentUrl(source.url)) return source.url;
  if (source.storage_path) {
    return (0, import_entityDocumentStorage.buildEntityDocProxyUrl)(source.storage_path, source.storage_bucket || import_entityDocumentStorage.ENTITY_DOCS_BUCKET);
  }
  return null;
}
function collectStudentProfileDocuments(student) {
  const docs = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (doc) => {
    const url = resolveDocumentSourceUrl(doc);
    if (!url || seen.has(url)) return;
    seen.add(url);
    docs.push({ ...doc, url });
  };
  const standardFields = [
    { key: "profile_image_url", label: "Profile Photo" },
    { key: "b_form_doc", label: "B-Form / Birth Certificate" },
    { key: "father_cnic_doc", label: "Father CNIC Scan" },
    { key: "death_certificate_doc", label: "Death Certificate" },
    { key: "leaving_cert_doc", label: "Leaving Certificate" }
  ];
  for (const { key, label } of standardFields) {
    const url = student[key];
    if (isDocumentUrl(url)) add({ title: label, url });
  }
  const customFields = student.custom_fields;
  if (customFields && typeof customFields === "object") {
    for (const [fieldName, value] of Object.entries(customFields)) {
      if (isDocumentUrl(value)) {
        add({ title: `Custom - ${fieldName}`, url: value });
      }
    }
  }
  if (Array.isArray(student.document_gallery)) {
    for (const entry of student.document_gallery) {
      if (!entry) continue;
      add({
        title: entry.title?.trim() || "Gallery Document",
        url: entry.url,
        storage_path: entry.storage_path,
        storage_bucket: entry.storage_bucket
      });
    }
  }
  return docs;
}
function collectTeacherProfileDocuments(teacher) {
  const docs = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (doc) => {
    const url = resolveDocumentSourceUrl(doc);
    if (!url || seen.has(url)) return;
    seen.add(url);
    docs.push({ ...doc, url });
  };
  const standardFields = [
    { key: "profile_image_url", label: "Profile Photo" },
    { key: "cnic_doc", label: "CNIC Card Scan" },
    { key: "degree_doc", label: "Degree Certificate" },
    { key: "work_exp_doc", label: "Work Experience Certificate" }
  ];
  for (const { key, label } of standardFields) {
    const url = teacher[key];
    if (isDocumentUrl(url)) add({ title: label, url });
  }
  const customFields = teacher.custom_fields;
  if (customFields && typeof customFields === "object") {
    for (const [fieldName, value] of Object.entries(customFields)) {
      if (isDocumentUrl(value)) {
        add({ title: `Custom - ${fieldName}`, url: value });
      }
    }
  }
  if (Array.isArray(teacher.document_gallery)) {
    for (const entry of teacher.document_gallery) {
      if (!entry) continue;
      add({
        title: entry.title?.trim() || "Gallery Document",
        url: entry.url,
        storage_path: entry.storage_path,
        storage_bucket: entry.storage_bucket
      });
    }
  }
  return docs;
}
function collectProfileDocumentSources(entity, entityType) {
  return entityType === "student" ? collectStudentProfileDocuments(entity) : collectTeacherProfileDocuments(entity);
}
async function attachmentFromDocumentSource(source, baseName) {
  const bucket = source.storage_bucket || import_entityDocumentStorage.ENTITY_DOCS_BUCKET;
  let url = resolveDocumentSourceUrl(source);
  if (!url && !source.storage_path) return null;
  if (!url && source.storage_path) {
    url = (0, import_entityDocumentStorage.buildEntityDocProxyUrl)(source.storage_path, bucket);
  }
  if (!url) return null;
  let att = null;
  if (url.startsWith("data:")) {
    att = attachmentFromDataUrl(url, baseName);
  } else if (url.includes("/api/supabase/file")) {
    att = await attachmentFromSupabaseFileUrl(url, baseName);
  } else if (url.startsWith("http://") || url.startsWith("https://")) {
    att = await attachmentFromHttpUrl(url, baseName);
  }
  if (!att && source.storage_path) {
    att = await attachmentFromStoragePath(source.storage_path, bucket, baseName);
  }
  return att;
}
async function buildProfileDocumentGalleryAttachments(entity, entityType, filenamePrefix) {
  const sources = collectProfileDocumentSources(entity, entityType);
  if (sources.length === 0) return [];
  const attachments = [];
  const usedNames = /* @__PURE__ */ new Set();
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    let baseName = `${filenamePrefix}_${safeFilenamePart(source.title)}`;
    if (usedNames.has(baseName)) baseName = `${baseName}_${i + 1}`;
    usedNames.add(baseName);
    const att = await attachmentFromDocumentSource(source, baseName);
    if (att) attachments.push(att);
  }
  return attachments;
}
function attachmentFromDataUrl(url, baseName) {
  const match = url.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  const ext = resolveExtension(match[1], match[2]);
  return {
    filename: `${safeFilenamePart(baseName)}.${ext}`,
    content: match[2],
    encoding: "base64"
  };
}
async function attachmentFromHttpUrl(url, baseName) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "";
    const ext = resolveExtension(ct, buffer);
    return {
      filename: `${safeFilenamePart(baseName)}.${ext}`,
      content: buffer.toString("base64"),
      encoding: "base64"
    };
  } catch {
    return null;
  }
}
async function attachmentFromStoragePath(storagePath, bucketName, baseName) {
  try {
    let download = await (0, import_supabaseFailover.downloadStorageWithFailover)(bucketName, storagePath);
    if (!download.ok || !download.buffer) {
      download = await (0, import_entityDocumentDatabase.loadEntityDocumentFromDatabaseAuto)(bucketName, storagePath);
    }
    if (!download.ok || !download.buffer) return null;
    const pathExt = storagePath.split(".").pop();
    const validatedPathExt = pathExt && pathExt.length <= 5 ? pathExt : void 0;
    const ext = resolveExtension(download.contentType || "", download.buffer, validatedPathExt);
    return {
      filename: `${safeFilenamePart(baseName)}.${ext}`,
      content: download.buffer.toString("base64"),
      encoding: "base64"
    };
  } catch {
    return null;
  }
}
async function attachmentFromSupabaseFileUrl(url, baseName) {
  try {
    const parsed = new URL(url, "http://localhost");
    if (!parsed.pathname.includes("/api/supabase/file")) return null;
    const storagePath = parsed.searchParams.get("path") || "";
    const bucketName = parsed.searchParams.get("bucket") || import_entityDocumentStorage.ENTITY_DOCS_BUCKET;
    if (!storagePath || !storagePath.includes("/")) return null;
    const download = await (0, import_supabaseFailover.downloadStorageWithFailover)(bucketName, storagePath);
    if (!download.ok || !download.buffer) return null;
    const pathExt = storagePath.split(".").pop();
    const validatedPathExt = pathExt && pathExt.length <= 5 ? pathExt : void 0;
    const ext = resolveExtension(download.contentType || "", download.buffer, validatedPathExt);
    return {
      filename: `${safeFilenamePart(baseName)}.${ext}`,
      content: download.buffer.toString("base64"),
      encoding: "base64"
    };
  } catch {
    return null;
  }
}
async function buildDocumentGalleryEmailAttachments(gallery, filenamePrefix) {
  if (!Array.isArray(gallery) || gallery.length === 0) return [];
  const attachments = [];
  const usedNames = /* @__PURE__ */ new Set();
  for (let i = 0; i < gallery.length; i++) {
    const entry = gallery[i];
    const bucket = entry.storage_bucket || import_entityDocumentStorage.ENTITY_DOCS_BUCKET;
    let url = typeof entry?.url === "string" ? entry.url.trim() : "";
    if (!url && entry.storage_path) {
      url = (0, import_entityDocumentStorage.buildEntityDocProxyUrl)(entry.storage_path, bucket);
    }
    if (!url && !entry.storage_path) continue;
    const title = entry.title?.trim() || `Gallery_${i + 1}`;
    let baseName = `${filenamePrefix}_Gallery_${title}`;
    if (usedNames.has(baseName)) baseName = `${baseName}_${i + 1}`;
    usedNames.add(baseName);
    const att = await attachmentFromDocumentSource(
      {
        title,
        url,
        storage_path: entry.storage_path,
        storage_bucket: entry.storage_bucket
      },
      baseName
    );
    if (att) attachments.push(att);
  }
  return attachments;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildDocumentGalleryEmailAttachments,
  buildProfileDocumentGalleryAttachments,
  collectProfileDocumentSources
});
