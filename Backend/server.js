const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3111;

// Enhanced CORS configuration
const allowedOrigins = [
  'http://localhost:8047',
  'http://localhost:8048',
  'http://frontend',
  'http://hr_page',
  'http://54.166.206.245:8047',
  'http://54.166.206.245:8048'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      console.error(msg);
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Middleware
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'public')));

// Database connection with retry logic
const poolConfig = {
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'postgres',
  database: process.env.PGDATABASE || 'new_employee_db',
  password: process.env.PGPASSWORD || 'admin123',
  port: process.env.PGPORT || 5432,
  retryDelay: 5000, // 5 seconds between retries
  retryLimit: 5     // Max 5 retries
};

let pool;
let retryCount = 0;

const connectWithRetry = () => {
  pool = new Pool(poolConfig);
  
  pool.connect()
    .then(client => {
      console.log(`[${new Date().toISOString()}] Successfully connected to PostgreSQL`);
      client.release();
      return initializeDatabase();
    })
    .catch(err => {
      if (retryCount < poolConfig.retryLimit) {
        retryCount++;
        console.error(`[${new Date().toISOString()}] Database connection failed (attempt ${retryCount}), retrying in ${poolConfig.retryDelay/1000} seconds...`);
        setTimeout(connectWithRetry, poolConfig.retryDelay);
      } else {
        logError('Database connection error - max retries reached', err);
        process.exit(1);
      }
    });
};

// Error logging with more context
const logError = (message, error) => {
  const errorDetails = {
    timestamp: new Date().toISOString(),
    message,
    error: error.message || error.toString(),
    stack: error.stack,
    dbConnection: pool ? pool.totalCount : 'not connected'
  };
  console.error(JSON.stringify(errorDetails, null, 2));
};

// Initialize database with more robust table creation
async function initializeDatabase() {
  const createTableQuery = `
    DROP TABLE IF EXISTS payslips;
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
      other_deduction DECIMAL(10,2) NOT NULL,
      net_salary DECIMAL(10,2) NOT NULL,
      status TEXT NOT NULL,
      CONSTRAINT unique_employee_month_year UNIQUE (employee_id, month_year)
    );
    
    INSERT INTO payslips (
      payslip_id, employee_id, employee_name, employee_email, month_year,
      designation, office_location, employment_type, date_of_joining,
      working_days, bank_name, pan_no, bank_account_no, pf_no,
      uan_no, esic_no, basic_salary, hra, other_allowance,
      professional_tax, tds, provident_fund, lwp, other_deduction,
      net_salary, status
    ) VALUES (
      'PSL-JANUARY2024-001', 'ATS0001', 'John Doe', 'john@example.com', 'January 2024',
      'Software Engineer', 'Hyderabad', 'Permanent', '2020-01-15',
      22, 'State Bank', 'ABCDE1234F', '1234567890', 'PF12345678',
      '123456789012', 'ESIC12345', 50000.00, 20000.00, 5000.00,
      200.00, 5000.00, 3000.00, 0.00, 0.00,
      62800.00, 'Generated'
    ) ON CONFLICT DO NOTHING;
  `;

  try {
    await pool.query(createTableQuery);
    console.log(`[${new Date().toISOString()}] Database initialized successfully`);
  } catch (err) {
    logError('Error initializing database', err);
    throw err;
  }
}

// Start database connection
connectWithRetry();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    dbStatus: pool ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// Rest of your existing routes (payslips, history, etc.) remain the same
// ... [Keep all your existing route handlers unchanged]

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  logError('Unhandled application error', err);
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id,
    timestamp: new Date().toISOString()
  });
});

// Start server with more verbose logging
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Server running on http://0.0.0.0:${port}`);
  console.log(`[${new Date().toISOString()}] Allowed CORS origins:`, allowedOrigins);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log(`[${new Date().toISOString()}] Received SIGTERM, shutting down gracefully...`);
  server.close(() => {
    console.log(`[${new Date().toISOString()}] HTTP server closed`);
    pool.end(() => {
      console.log(`[${new Date().toISOString()}] Database connection pool closed`);
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log(`[${new Date().toISOString()}] Received SIGINT, shutting down gracefully...`);
  server.close(() => {
    console.log(`[${new Date().toISOString()}] HTTP server closed`);
    pool.end(() => {
      console.log(`[${new Date().toISOString()}] Database connection pool closed`);
      process.exit(0);
    });
  });
});
