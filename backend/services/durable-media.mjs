import { db } from '../db.mjs';

db.exec(`
CREATE TABLE IF NOT EXISTS durable_media_blobs(
 storage_key TEXT PRIMARY KEY,
 mime_type TEXT NOT NULL,
 bytes BLOB NOT NULL,
 size_bytes INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

export function storeMediaBlob({storageKey,mimeType,bytes}){
 const key=String(storageKey||'').trim();
 if(!key)throw Object.assign(new Error('Clé média obligatoire.'),{status:400,code:'MEDIA_KEY_REQUIRED'});
 const buf=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes||[]);
 if(!buf.length)throw Object.assign(new Error('Média vide.'),{status:400,code:'MEDIA_EMPTY'});
 db.prepare(`INSERT INTO durable_media_blobs(storage_key,mime_type,bytes,size_bytes,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(storage_key) DO UPDATE SET mime_type=excluded.mime_type,bytes=excluded.bytes,size_bytes=excluded.size_bytes`).run(key,String(mimeType||'application/octet-stream'),buf,buf.length);
 return{storageKey:key,mimeType:String(mimeType||'application/octet-stream'),sizeBytes:buf.length}
}

export function readMediaBlob(storageKey){
 const row=db.prepare(`SELECT storage_key,mime_type,bytes,size_bytes,created_at FROM durable_media_blobs WHERE storage_key=?`).get(String(storageKey||''));
 if(!row)return null;
 return{storageKey:row.storage_key,mimeType:row.mime_type,bytes:Buffer.from(row.bytes),sizeBytes:Number(row.size_bytes||0),createdAt:row.created_at}
}

export function deleteMediaBlob(storageKey){return db.prepare(`DELETE FROM durable_media_blobs WHERE storage_key=?`).run(String(storageKey||''))}
export function mediaStorageStats(){const row=db.prepare(`SELECT COUNT(*) items,COALESCE(SUM(size_bytes),0) bytes FROM durable_media_blobs`).get();return{items:Number(row.items||0),bytes:Number(row.bytes||0)}}
