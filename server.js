// server.js
// 写真受信→Azure Blob へ転送保存（multipart/form-data または JSON base64）
// 環境変数: AZURE_STORAGE_CONNECTION_STRING, BLOB_CONTAINER, MAX_UPLOAD_MB(optional)

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { BlobServiceClient } = require('@azure/storage-blob');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 20);
const containerName = process.env.BLOB_CONTAINER || 'photos';
const AZ_CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;

if (!AZ_CONN) {
  console.error('AZURE_STORAGE_CONNECTION_STRING 未設定');
}
const blobServiceClient = AZ_CONN ? BlobServiceClient.fromConnectionString(AZ_CONN) : null;

app.use(express.json({ limit: `${maxUploadMb}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${maxUploadMb}mb` }));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => res.type('text').send('OK'));

// --- utils ---
function detectContentType(buffer, fallback = 'application/octet-stream') {
  const sig = buffer.slice(0, 8).toString('hex');
  if (sig.startsWith('ffd8ff')) return 'image/jpeg';
  if (sig.startsWith('89504e47')) return 'image/png';
  if (sig.startsWith('47494638')) return 'image/gif';
  if (sig.startsWith('424d')) return 'image/bmp';
  if (sig.startsWith('49492a00') || sig.startsWith('4d4d002a')) return 'image/tiff';
  if (sig.startsWith('25504446')) return 'application/pdf';
  return fallback;
}

function genBlobName(ext = '') {
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(6).toString('hex');
  return `${ts}_${rand}${ext ? '.' + ext.replace(/^\./, '') : ''}`;
}

async function ensureContainer(client, name) {
  const container = client.getContainerClient(name);
  await container.createIfNotExists({ access: 'private' });
  return container;
}

async function uploadBufferToBlob(buffer, contentType, preferredExt = '') {
  if (!blobServiceClient) throw new Error('Storage 接続未設定');
  const container = await ensureContainer(blobServiceClient, containerName);
  const blobName = genBlobName(preferredExt);
  const blockBlob = container.getBlockBlobClient(blobName);
  const headers = { blobHTTPHeaders: { blobContentType: contentType } };
  await blockBlob.uploadData(buffer, headers);
  return { blobName, url: blockBlob.url, contentType, size: buffer.length };
}

// --- 1) multipart/form-data 受信 ---
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: maxUploadMb * 1024 * 1024, files: 1 }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'file 必須（multipart/form-data）' });
    }
    const buf = req.file.buffer;
    const ct = req.file.mimetype || detectContentType(buf);
    const ext = (req.file.originalname || '').split('.').pop();
    const { blobName, url, contentType, size } = await uploadBufferToBlob(buf, ct, ext);
    return res.status(201).json({ blobName, url, contentType, size });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'upload 失敗' });
  }
});

// --- 2) JSON(base64) 受信 ---
// 例: { "filename":"photo.jpg", "data":"data:image/jpeg;base64,/9j/..." } または { "filename":"photo.jpg", "base64":"/9j/..." }
app.post('/api/uploadBase64', async (req, res) => {
  try {
    const { filename, data, base64 } = req.body || {};
    if (!data && !base64) {
      return res.status(400).json({ error: 'data または base64 必須' });
    }
    let b64 = base64 || '';
    let ct = 'application/octet-stream';

    if (data) {
      const m = /^data:([^;]+);base64,(.+)$/i.exec(data);
      if (m) {
        ct = m[1];
        b64 = m[2];
      } else {
        b64 = data;
      }
    }
    const buf = Buffer.from(b64, 'base64');
    if (!data || ct === 'application/octet-stream') {
      ct = detectContentType(buf, ct);
    }
    const ext = (filename || '').split('.').pop();
    const { blobName, url, contentType, size } = await uploadBufferToBlob(buf, ct, ext);
    return res.status(201).json({ blobName, url, contentType, size });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'upload 失敗' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`listening on ${port}`);
});
