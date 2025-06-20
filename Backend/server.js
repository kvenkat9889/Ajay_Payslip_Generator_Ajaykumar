require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3401;

const UPLOAD_DIR = path.join(__dirname, process.env.UPLOAD_DIR || '../upload');
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || '10mb';
const DB_CONFIG = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'postgres',
  database: process.env.DB_NAME || 'new_employee_db',
  password: process.env.DB_PASSWORD || 'admin123',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(`Created upload directory: ${UPLOAD_DIR}`);
}

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [
    'http://44.223.23.145:3401',
    'http://127.0.0.1:5500',
    'http://44.223.23.145:5500',
    'http://127.0.0.1:5503',
    'null'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later'
});
app.use(limiter);

app.use(morgan('combined'));
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.json({ limit: MAX_FILE_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_FILE_SIZE }));

const pool = new Pool(DB_CONFIG);
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      drop table if exists payslips;
      CREATE TABLE IF NOT EXISTS payslips (
        payslip_id VARCHAR(20) PRIMARY KEY,
        employee_id TEXT NOT NULL,
        employee_name TEXT NOT NULL,
        employee_email TEXT NOT NULL,
        month_year TEXT NOT NULL,
        designation TEXT NOT NULL,
        office_location TEXT NOT NULL,
        employment_type TEXT NOT NULL,
        date_of_joining DATE NOT NULL,
        working_days INTEGER NOT NULL,
        bank_name TEXT NOT NULL,
        pan_no TEXT NOT NULL,
        bank_account_no TEXT NOT NULL,
        pf_no TEXT NOT NULL,
        uan_no TEXT NOT NULL,
        esic_no TEXT NOT NULL,
        basic_salary DECIMAL(10,2) NOT NULL,
        hra DECIMAL(10,2) NOT NULL,
        other_allowance DECIMAL(10,2) NOT NULL,
        professional_tax DECIMAL(10,2) NOT NULL,
        tds DECIMAL(10,2) NOT NULL,
        provident_fund DECIMAL(10,2) NOT NULL,
        lwp DECIMAL(10,2) NOT NULL,
        other_deduction DECIMAL(10,2),
        net_salary DECIMAL(10,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'Generated',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT unique_employee_month_year UNIQUE (employee_id, month_year)
      );

      CREATE OR REPLACE FUNCTION update_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS update_payslips_timestamp ON payslips;
      CREATE TRIGGER update_payslips_timestamp
      BEFORE UPDATE ON payslips
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();
    `);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: pool.totalCount > 0 ? 'connected' : 'disconnected'
  });
});

app.get('/api-docs', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payslip API Documentation</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        .endpoint { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .method { font-weight: bold; color: #fff; background: #333; padding: 3px 8px; border-radius: 3px; display: inline-block; }
        .path { font-family: monospace; margin-left: 10px; }
        .get { background: #61affe; }
        .post { background: #49cc90; }
        .put { background: #fca130; }
        .delete { background: #f93e3e; }
      </style>
    </head>
    <body>
      <h1>Payslip API Documentation</h1>
      
      <div class="endpoint">
        <div><span class="method get">GET</span><span class="path">/health</span></div>
        <p>Server health check endpoint</p>
      </div>
      
      <div class="endpoint">
        <div><span class="method post">POST</span><span class="path">/api/payslips</span></div>
        <p>Create a new payslip</p>
        <pre>Request body: {
  employee_id: string,
  employee_name: string,
  employee_email: string,
  month_year: string,
  designation: string,
  office_location: string,
  employment_type: string,
  date_of_joining: string (YYYY-MM-DD),
  working_days: number,
  bank_name: string,
  pan_no: string,
  bank_account_no: string,
  pf_no: string,
  uan_no: string,
  esic_no: string,
  basic_salary: number,
  hra: number,
  other_allowance: number,
  professional_tax: number,
  tds: number,
  provident_fund: number,
  lwp: number,
  other_deduction: number
}</pre>
      </div>
      
      <div class="endpoint">
        <div><span class="method get">GET</span><span class="path">/api/payslips/history</span></div>
        <p>Get payslip history with pagination</p>
        <p>Query parameters: search, month, year, page, limit</p>
      </div>
      
      <div class="endpoint">
        <div><span class="method get">GET</span><span class="path">/api/payslips/:id</span></div>
        <p>Get a specific payslip by ID</p>
      </div>
    </body>
    </html>
  `);
});

const router = express.Router();

router.post('/payslips', validatePayslip, async (req, res) => {
  const client = await pool.connect();
  try {
    const { body } = req;
    const netSalary = calculateNetSalary(body);
    const payslipId = generatePayslipId(body.month_year);

    await client.query('BEGIN');
    
    const exists = await client.query(
      'SELECT 1 FROM payslips WHERE employee_id = $1 AND month_year = $2',
      [body.employee_id, body.month_year]
    );

    if (exists.rowCount > 0) {
      return res.status(409).json({ error: 'Payslip already exists' });
    }

    const result = await client.query(
      `INSERT INTO payslips (
        payslip_id, employee_id, employee_name, employee_email, month_year,
        designation, office_location, employment_type, date_of_joining,
        working_days, bank_name, pan_no, bank_account_no, pf_no,
        uan_no, esic_no, basic_salary, hra, other_allowance,
        professional_tax, tds, provident_fund, lwp, other_deduction,
        net_salary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING *`,
      [
        payslipId, body.employee_id, body.employee_name, body.employee_email, body.month_year,
        body.designation, body.office_location, body.employment_type, body.date_of_joining,
        body.working_days, body.bank_name, body.pan_no, body.bank_account_no, body.pf_no,
        body.uan_no, body.esic_no, body.basic_salary, body.hra, body.other_allowance,
        body.professional_tax, body.tds, body.provident_fund, body.lwp, body.other_deduction || 0,
        netSalary
      ]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Payslip creation failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

router.get('/payslips/history', async (req, res) => {
  const { search, month, year, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const [data, count] = await Promise.all([
      getPayslips(search, month, year, limit, offset),
      getPayslipCount(search, month, year)
    ]);

    res.json({
      data,
      pagination: {
        total: parseInt(count),
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    console.error('History fetch failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/payslips/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM payslips WHERE payslip_id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Payslip not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Payslip fetch failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function validatePayslip(req, res, next) {
  const { body } = req;
  const errors = [];

  if (!body.employee_id || !/^ATS0\d{3}$/.test(body.employee_id)) {
    errors.push('Invalid employee ID format (ATS0XXX)');
  }
  if (!body.employee_name || body.employee_name.length < 3) {
    errors.push('Employee name must be at least 3 characters');
  }
  if (!body.employee_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.employee_email)) {
    errors.push('Invalid email format');
  }
  if (!body.month_year || !/^[A-Za-z]+\s\d{4}$/.test(body.month_year)) {
    errors.push('Month year must be in format "Month YYYY"');
  }
  if (!body.basic_salary || isNaN(body.basic_salary) || body.basic_salary <= 0) {
    errors.push('Basic salary must be a positive number');
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
}

function calculateNetSalary(data) {
  return (data.basic_salary + data.hra + data.other_allowance) -
    (data.professional_tax + data.tds + data.provident_fund + data.lwp + (data.other_deduction || 0));
}

function generatePayslipId(monthYear) {
  const yearMonth = monthYear.replace(' ', '').toUpperCase();
  return `PSL-${yearMonth}-${Math.floor(100 + Math.random() * 900)}`;
}

async function getPayslips(search, month, year, limit, offset) {
  let query = 'SELECT * FROM payslips WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (employee_id ILIKE $1 OR employee_name ILIKE $1)';
    params.push(`%${search}%`);
  }

  if (month) {
    query += ` AND EXTRACT(MONTH FROM TO_DATE(month_year, 'Month YYYY')) = $${params.length + 1}`;
    params.push(parseInt(month));
  }

  if (year) {
    query += ` AND EXTRACT(YEAR FROM TO_DATE(month_year, 'Month YYYY')) = $${params.length + 1}`;
    params.push(parseInt(year));
  }

  query += ` ORDER BY TO_DATE(month_year, 'Month YYYY') DESC, employee_id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await pool.query(query, params);
  return result.rows;
}

async function getPayslipCount(search, month, year) {
  let query = 'SELECT COUNT(*) FROM payslips WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (employee_id ILIKE $1 OR employee_name ILIKE $1)';
    params.push(`%${search}%`);
  }

  if (month) {
    query += ` AND EXTRACT(MONTH FROM TO_DATE(month_year, 'Month YYYY')) = $${params.length + 1}`;
    params.push(parseInt(month));
  }

  if (year) {
    query += ` AND EXTRACT(YEAR FROM TO_DATE(month_year, 'Month YYYY')) = $${params.length + 1}`;
    params.push(parseInt(year));
  }

  const result = await pool.query(query, params);
  return result.rows[0].count;
}

app.use('/api', router);

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

async function startServer() {
  try {
    await initializeDatabase();
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`API Documentation: http://44.223.23.145:${PORT}/api-docs`);
    });

    process.on('SIGTERM', () => shutdown(server));
    process.on('SIGINT', () => shutdown(server));
  } catch (err) {
    console.error('Server startup failed:', err);
    process.exit(1);
  }
}

function shutdown(server) {
  console.log('Shutting down gracefully...');
  server.close(() => {
    pool.end().then(() => {
      console.log('Server and database pool closed');
      process.exit(0);
    });
  });
}

startServer();