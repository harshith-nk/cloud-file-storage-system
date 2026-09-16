const mongoose = require('mongoose');
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
    const { search, minSize, maxSize, type } = req.query;

    const query = { userId: req.userId };

    // $regex — partial, case-insensitive filename search
    if (search) {
      query.originalName = { $regex: search, $options: 'i' };
    }

    // $gt / $lt — filter by file size range (bytes)
    if (minSize || maxSize) {
      query.size = {};
      if (minSize) query.size.$gt = Number(minSize);
      if (maxSize) query.size.$lt = Number(maxSize);
    }

    // $in — filter by one or more MIME types (e.g. type=application/pdf,image/png)
    if (type) {
      query.fileType = { $in: type.split(',').map((t) => t.trim()) };
    }

    const files = await File.find(query).sort({ uploadDate: -1 });
    res.json(files);
  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// GET /api/files/stats — total storage used + file count, computed by MongoDB
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const result = await File.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.userId) } },
      {
        $group: {
          _id: null,
          totalSize: { $sum: '$size' },
          totalFiles: { $sum: 1 },
          avgSize: { $avg: '$size' },
          maxSize: { $max: '$size' },
          minSize: { $min: '$size' },
        },
      },
    ]);

    const stats = result[0] || {
      totalSize: 0, totalFiles: 0, avgSize: 0, maxSize: 0, minSize: 0,
    };

    res.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to compute stats' });
  }
});

// PATCH /api/files/:id/rename
router.patch('/:id/rename', authMiddleware, async (req, res) => {
  try {
    const { newName } = req.body;

    if (!newName || !newName.trim()) {
      return res.status(400).json({ error: 'New name is required' });
    }

    const file = await File.findOne({ _id: req.params.id, userId: req.userId });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    let finalName = newName.trim();

    // Same duplicate-check pattern as upload
    const nameParts = finalName.split('.');
    const ext = nameParts.length > 1 ? '.' + nameParts.pop() : '';
    const baseName = nameParts.join('.');
    let counter = 1;

    let nameExists = await File.findOne({
      userId: req.userId,
      originalName: finalName,
      _id: { $ne: file._id }, // ignore the file being renamed itself
    });

    while (nameExists) {
      finalName = `${baseName}(${counter})${ext}`;
      nameExists = await File.findOne({
        userId: req.userId,
        originalName: finalName,
        _id: { $ne: file._id },
      });
      counter++;
    }

    file.originalName = finalName;
    await file.save();

    res.json({ message: 'File renamed successfully', file });
  } catch (err) {
    console.error('Rename error:', err);
    res.status(500).json({ error: 'Failed to rename file' });
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