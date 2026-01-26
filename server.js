
// server.js
import express from "express";
import multer from "multer";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json({ limit: "20mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const accountName = process.env.AZURE_STORAGE_ACCOUNT;
const containerName = process.env.AZURE_BLOB_CONTAINER;
const credential = new DefaultAzureCredential();
const blobServiceClient = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, credential);
const containerClient = blobServiceClient.getContainerClient(containerName);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

function denyIfNotIntranet(req, res, next) {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString();
  // 例：10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, ::1, fc00::/7
  const ok =
    ip.startsWith("10.") ||
    ip.startsWith("172.16.") || ip.startsWith("172.17.") || ip.startsWith("172.18.") || ip.startsWith("172.19.") ||
    ip.startsWith("172.2") || ip.startsWith("192.168.") ||
    ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("127.");
  if (!ok) return res.status(403).end();
  next();
}

app.post("/upload", denyIfNotIntranet, upload.single("photo"), async (req, res) => {
  try {
    const { extraID, ts } = req.body;
    const ext = (req.file?.mimetype === "image/png") ? "png" : "jpg";
    const name = `${extraID}_${ts}.${ext}`;
    const blockBlob = containerClient.getBlockBlobClient(name);
    await blockBlob.uploadData(req.file.buffer, {
      blobHTTPHeaders: { blobContentType: req.file.mimetype || "image/jpeg" }
    });
    res.json({ ok: true, blobName: name });
  } catch {
    res.status(500).json({ ok: false });
  }
});

app.post("/cv", denyIfNotIntranet, async (req, res) => {
  // ダミー（CV処理の代替・所要時間シミュレート）
  setTimeout(() => res.json({ ok: true, cv: { labels: [] } }), 100);
});

app.post("/di", denyIfNotIntranet, async (req, res) => {
  // ダミー（DI処理の代替・所要時間シミュレート）
  setTimeout(() => res.json({ ok: true, di: { fields: {} } }), 120);
});

const port = process.env.PORT || 3000;
app.listen(port);
``
