const express = require('express');
const multer = require('multer');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const s3Client = require('../config/s3');
const File = require('../models/File');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Multer setup: store file temporarily in memory before sending to S3
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});


// POST /api/files/upload
// POST /api/files/upload
router.post('/upload', authMiddleware, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = [];

    for (const file of req.files) {

      // Check for duplicate filenames for this user, auto-rename if needed
      let finalName = file.originalname;

      const nameParts = finalName.split('.');
      const ext = nameParts.length > 1 ? '.' + nameParts.pop() : '';
      const baseName = nameParts.join('.');

      let counter = 1;

      let nameExists = await File.findOne({
        userId: req.userId,
        originalName: finalName
      });

      while (nameExists) {
        finalName = `${baseName}(${counter})${ext}`;

        nameExists = await File.findOne({
          userId: req.userId,
          originalName: finalName
        });

        counter++;
      }

      // Unique S3 key
      const s3Key = `${Date.now()}-${finalName}`;

      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await s3Client.send(command);

      // Save metadata in MongoDB
      const newFile = new File({
        originalName: finalName,
        s3Key: s3Key,
        fileType: file.mimetype,
        size: file.size,
        userId: req.userId,
      });

      await newFile.save();

      uploadedFiles.push(newFile);
    }

    res.status(201).json({
      message: `${uploadedFiles.length} file(s) uploaded successfully`,
      files: uploadedFiles,
    });

  } catch (err) {

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'One or more files exceed the 50MB limit'
      });
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Maximum 10 files can be uploaded at once'
      });
    }

    console.error('Upload error:', err);

    res.status(500).json({
      error: 'File upload failed'
    });
  }
});
// GET /api/files/download/:id
router.get('/download/:id', authMiddleware, async (req, res) => {
  try {
    const file = await File.findOne({ _id: req.params.id, userId: req.userId });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: file.s3Key,
    });

    // URL valid for 5 minutes (300 seconds)
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    res.json({
      downloadUrl: url,
      fileName: file.originalName,
    });
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Failed to generate download link' });
  }
});

// GET /api/files
router.get('/', authMiddleware, async (req, res) => {
  try {
    const files = await File.find({ userId: req.userId }).sort({ uploadDate: -1 });
    res.json(files);
  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// DELETE /api/files/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const file = await File.findOne({ _id: req.params.id, userId: req.userId });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete from S3
    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: file.s3Key,
    });

    await s3Client.send(command);

    // Delete from MongoDB
    await File.findByIdAndDelete(req.params.id);

    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;