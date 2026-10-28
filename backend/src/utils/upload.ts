import multer from 'multer';

// For KML / KMZ uploads. Keeps the file in memory (no temp files on disk). Max 10 MB.
// Use it as: router.post('/import', requireAdmin, upload.single('file'), controller)
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});