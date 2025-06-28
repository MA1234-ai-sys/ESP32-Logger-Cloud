const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

db.connect(err => {
  if (err) throw err;
  console.log('Connected to MySQL DB');
});

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'esp32-secret',
  resave: false,
  saveUninitialized: true
}));
app.use(express.static('public'));

function authMiddleware(req, res, next) {
  if (req.session.loggedIn) return next();
  return res.redirect('/login.html');
}

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
    if (err || results.length === 0) return res.redirect('/login.html');
    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      req.session.loggedIn = true;
      res.redirect('/');
    } else {
      res.redirect('/login.html');
    }
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login.html');
  });
});

app.use(['/','/graph.html','/logs','/export/csv','/export/pdf'], authMiddleware);

app.post('/data', (req, res) => {
  const { device, temperature, humidity } = req.body;
  db.query(
    'INSERT INTO sensor_data (device, temperature, humidity) VALUES (?, ?, ?)',
    [device, temperature, humidity],
    (err, result) => {
      if (err) return res.status(500).send('DB error');
      res.send(`Data inserted with ID: ${result.insertId}`);
    }
  );
});

app.get('/logs', (req, res) => {
  db.query('SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT 100', (err, results) => {
    if (err) return res.status(500).send('DB read error');
    res.json(results);
  });
});

app.get('/export/csv', (req, res) => {
  db.query('SELECT * FROM sensor_data ORDER BY timestamp DESC', (err, results) => {
    if (err) return res.status(500).send('DB error');
    const parser = new Parser();
    const csv = parser.parse(results);
    res.header('Content-Type', 'text/csv');
    res.attachment('sensor_data.csv');
    return res.send(csv);
  });
});

app.get('/export/pdf', (req, res) => {
  db.query('SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT 100', (err, rows) => {
    if (err) return res.status(500).send('DB error');
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="sensor_data.pdf"');
    doc.pipe(res);
    doc.fontSize(16).text('Sensor Data Export', { align: 'center' }).moveDown();
    rows.forEach(row => {
      doc.fontSize(10).text(`ID: ${row.id}, Device: ${row.device}, Temp: ${row.temperature} °C, Hum: ${row.humidity} %, Time: ${row.timestamp}`);
    });
    doc.end();
  });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
