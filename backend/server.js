require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));                    // ← was 10mb, increased for large payloads
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // ← added limit

// Extend timeout for import routes (large files with 15k+ lots)
app.use('/api/import', (req, res, next) => {
  req.setTimeout(300000);  // 5 minutes
  res.setTimeout(300000);
  next();
});

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, validate: { trustProxy: false } });
app.use(limiter);

// Routes
app.use('/api/import',   require('./routes/import'));
app.use('/api/mapping',  require('./routes/mapping'));
app.use('/api/marking',  require('./routes/marking'));
app.use('/api/reports',  require('./routes/reports'));
app.use('/api/labels',   require('./routes/labels'));
app.use('/api/parties',  require('./routes/parties'));
app.use('/api/ai',       require('./routes/ai'));
app.use('/api/catalogue',require('./routes/catalogue'));
app.use('/api/auth',     require('./routes/auth'));       // ← add this line

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
}

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

app.listen(PORT, () => console.log(`Tea Auction API running on port ${PORT}`));
