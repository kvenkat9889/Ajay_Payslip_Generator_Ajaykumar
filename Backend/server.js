const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); // Add fs for file system operations

const app = express();
const PORT = 3111;

// Absolute path to the upload directory (replace with your actual path)
const UPLOAD_DIR = '../upload';


if (!fs.existsSync(UPLOAD_DIR)) {
    console.error(`[${new Date().toISOString()}] Upload directory does not exist: ${UPLOAD_DIR}`);
    process.exit(1); // Exit if the directory is not found
}

// CORS configuration
const allowedOrigins = [
    'http://3.88.203.125:8048',
    'http://3.88.203.125:8049',
    'http://3.88.203.125:5500',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://localhost:5501',
    'http://127.0.0.1:8048',
    'http://127.0.0.1:8049',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5501',
    'http://127.0.0.1:5502'
];

app.use(cors({
    origin: (origin, callback) => {
        console.log(`[${new Date().toISOString()}] Request Origin: ${origin}`);
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            const error = new Error(`Origin ${origin} not allowed by CORS`);
            callback(error);
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
}));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Middleware
app.use(express.json());

// Serve static files from the 'upload' directory using absolute path
app.use('/upload', express.static(UPLOAD_DIR, {
    dotfiles: 'ignore',
    index: false,
    redirect: false,
    setHeaders: (res, filePath) => {
        console.log(`[${new Date().toISOString()}] Serving file: ${filePath}`);
    }
}));
console.log(`[${new Date().toISOString()}] Serving static files from: ${UPLOAD_DIR}`);

// Add a specific route to test logo access
app.get('/upload/logo.png', (req, res) => {
    const logoPath = path.join(UPLOAD_DIR, 'logo.png');
    if (fs.existsSync(logoPath)) {
        res.sendFile(logoPath, err => {
            if (err) {
                console.error(`[${new Date().toISOString()}] Error serving logo.png:`, err.message);
                res.status(500).json({ error: 'Error serving logo' });
            }
        });
    } else {
        console.error(`[${new Date().toISOString()}] logo.png not found at: ${logoPath}`);
        res.status(404).json({ error: 'Logo file not found' });
    }
});

// PostgreSQL connection
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'new_employee_db',
    password: 'Password@12345',
    port: 5432
});

// Error logging
const logError = (message, error) => {
    console.error(`[${new Date().toISOString()}] ${message}:`, error.message || error);
};

// Initialize database
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
            other_deduction DECIMAL(10,2),
            net_salary DECIMAL(10,2) NOT NULL,
            status TEXT NOT NULL,
            CONSTRAINT unique_employee_month_year UNIQUE (employee_id, month_year)
        );
    `;

    try {
        await pool.query(createTableQuery);
        console.log(`[${new Date().toISOString()}] Database initialized successfully`);
    } catch (err) {
        logError('Error initializing database', err);
        throw err;
    }
}

// Connect to database
pool.connect()
    .then(() => {
        console.log(`[${new Date().toISOString()}] Connected to PostgreSQL`);
        return initializeDatabase();
    })
    .catch(err => {
        logError('Database connection error', err);
        process.exit(1);
    });

// Validation middleware for payslip creation
const validatePayslipData = (req, res, next) => {
    const requiredFields = [
        'employee_id', 'employee_name', 'employee_email', 'month_year',
        'designation', 'office_location', 'employment_type', 'date_of_joining',
        'working_days', 'bank_name', 'pan_no', 'bank_account_no', 'pf_no',
        'uan_no', 'esic_no', 'basic_salary', 'hra', 'other_allowance',
        'professional_tax', 'tds', 'provident_fund', 'lwp', 'other_deduction'
    ];

    for (const field of requiredFields) {
        if (req.body[field] === undefined || req.body[field] === null) {
            logError('Validation error', new Error(`${field} is required`));
            return res.status(400).json({ error: `${field} is required` });
        }
    }

    if (!/^ATS0[0-9]{3}$/.test(req.body.employee_id) || req.body.employee_id === 'ATS0000') {
        logError('Validation error', new Error('Invalid employee_id'));
        return res.status(400).json({ error: 'Employee ID must be ATS0 followed by 3 digits (not 000)' });
    }

    if (!/^[a-zA-Z]+(?:\s[a-zA-Z]+)*$/.test(req.body.employee_name)) {
        logError('Validation error', new Error('Invalid employee_name'));
        return res.status(400).json({ error: 'Name must contain letters and single spaces' });
    }

    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|in|org|co\.in)$/i.test(req.body.employee_email)) {
        logError('Validation error', new Error('Invalid employee_email'));
        return res.status(400).json({ error: 'Invalid email format' });
    }

    if (!/^[A-Za-z]+\s[0-9]{4}$/.test(req.body.month_year)) {
        logError('Validation error', new Error('Invalid month_year'));
        return res.status(400).json({ error: 'Month/Year must be in "Month YYYY" format' });
    }

    const validDesignations = [
        'Trainee Software Engineer', 'Junior Software Engineer', 'Software Engineer',
        'Senior Software Engineer', 'Associate Technical Lead', 'Technical Lead',
        'Project Manager', 'Trainee Test Engineer', 'Junior Test Engineer',
        'Test Engineer', 'Senior Test Engineer', 'Test Lead', 'Data Analyst',
        'Senior Data Analyst', 'Power BI Developer', 'Data Scientist',
        'DevOps Engineer', 'Senior DevOps Engineer', 'DevOps Architect',
        'HR Executive', 'HR Manager', 'Admin Executive', 'Admin Manager',
        'Finance Executive', 'Senior Finance Executive', 'Finance Manager'
    ];
    if (!validDesignations.includes(req.body.designation)) {
        logError('Validation error', new Error('Invalid designation'));
        return res.status(400).json({ error: 'Invalid designation' });
    }

    if (!['Hyderabad', 'Bangalore', 'Pune', 'Chennai', 'Delhi'].includes(req.body.office_location)) {
        logError('Validation error', new Error('Invalid office_location'));
        return res.status(400).json({ error: 'Office location must be Hyderabad, Bangalore, Pune, Chennai, or Delhi' });
    }

    if (!['Permanent', 'Contract', 'Temporary', 'Intern'].includes(req.body.employment_type)) {
        logError('Validation error', new Error('Invalid employment_type'));
        return res.status(400).json({ error: 'Employment type must be Permanent, Contract, Temporary, or Intern' });
    }

    const doj = new Date(req.body.date_of_joining);
    const minDate = new Date('2021-01-01');
    if (isNaN(doj.getTime()) || doj > new Date() || doj < minDate) {
        logError('Validation error', new Error('Invalid date_of_joining'));
        return res.status(400).json({ error: 'Date of joining must be between Jan 2021 and today' });
    }

    if (!Number.isInteger(req.body.working_days) || req.body.working_days < 1 || req.body.working_days > 31) {
        logError('Validation error', new Error('Invalid working_days'));
        return res.status(400).json({ error: 'Working days must be between 1 and 31' });
    }

    if (!/^[a-zA-Z\s]+$/.test(req.body.bank_name)) {
        logError('Validation error', new Error('Invalid bank_name'));
        return res.status(400).json({ error: 'Invalid bank name' });
    }

    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(req.body.pan_no)) {
        logError('Validation error', new Error('Invalid pan_no'));
        return res.status(400).json({ error: 'PAN must be 5 letters, 4 digits, 1 letter' });
    }

    if (!/^\d{10,18}$/.test(req.body.bank_account_no)) {
        logError('Validation error', new Error('Invalid bank_account_no'));
        return res.status(400).json({ error: 'Bank account number must be 10-18 digits' });
    }

    if (!/^[A-Z0-9]{12,22}$/.test(req.body.pf_no)) {
        logError('Validation error', new Error('Invalid pf_no'));
        return res.status(400).json({ error: 'PF number must be 12-22 alphanumeric characters' });
    }

    if (!/^\d{12}$/.test(req.body.uan_no)) {
        logError('Validation error', new Error('Invalid uan_no'));
        return res.status(400).json({ error: 'UAN must be exactly 12 digits' });
    }

    if (!/^[A-Z0-9]{10,17}$/.test(req.body.esic_no)) {
        logError('Validation error', new Error('Invalid esic_no'));
        return res.status(400).json({ error: 'ESIC number must be 10-17 alphanumeric characters' });
    }

    if (typeof req.body.basic_salary !== 'number' || req.body.basic_salary <= 0) {
        logError('Validation error', new Error('Invalid basic_salary'));
        return res.status(400).json({ error: 'Basic salary must be a positive number' });
    }

    const numericFields = ['hra', 'other_allowance', 'professional_tax', 'tds', 'provident_fund', 'lwp', 'other_deduction'];
    for (const field of numericFields) {
        if (typeof req.body[field] !== 'number' || req.body[field] < 0) {
            logError('Validation error', new Error(`Invalid ${field}`));
            return res.status(400).json({ error: `${field} must be a non-negative number` });
        }
    }

    next();
};

// Generate payslip
app.post('/api/payslips', validatePayslipData, async (req, res) => {
    const {
        employee_id, employee_name, employee_email, month_year,
        designation, office_location, employment_type, date_of_joining,
        working_days, bank_name, pan_no, bank_account_no, pf_no,
        uan_no, esic_no, basic_salary, hra, other_allowance,
        professional_tax, tds, provident_fund, lwp, other_deduction
    } = req.body;

    const net_salary = (basic_salary + hra + other_allowance) -
        (professional_tax + tds + provident_fund + lwp + other_deduction);

    const yearMonth = month_year.replace(' ', '').toUpperCase();
    const payslip_id = `PSL-${yearMonth}-${Math.floor(100 + Math.random() * 900)}`;

    try {
        const checkResult = await pool.query(
            'SELECT 1 FROM payslips WHERE employee_id = $1 AND month_year = $2',
            [employee_id, month_year]
        );

        if (checkResult.rowCount > 0) {
            logError('Payslip creation error', new Error('Duplicate payslip'));
            return res.status(400).json({ error: 'Payslip already exists for this employee and month/year' });
        }

        const insertResult = await pool.query(
            `INSERT INTO payslips (
                payslip_id, employee_id, employee_name, employee_email, month_year,
                designation, office_location, employment_type, date_of_joining,
                working_days, bank_name, pan_no, bank_account_no, pf_no,
                uan_no, esic_no, basic_salary, hra, other_allowance,
                professional_tax, tds, provident_fund, lwp, other_deduction,
                net_salary, status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19,
                $20, $21, $22, $23, $24, $25, $26
            ) RETURNING *`,
            [
                payslip_id, employee_id, employee_name, employee_email, month_year,
                designation, office_location, employment_type, date_of_joining,
                working_days, bank_name, pan_no, bank_account_no, pf_no,
                uan_no, esic_no, basic_salary, hra, other_allowance,
                professional_tax, tds, provident_fund, lwp, other_deduction,
                net_salary, 'Generated'
            ]
        );

        const newPayslip = insertResult.rows[0];
        console.log(`[${new Date().toISOString()}] Payslip created: ${payslip_id}`);
        res.status(201).json({
            message: 'Payslip generated successfully',
            payslip: newPayslip
        });
    } catch (err) {
        logError('Payslip creation error', err);
        if (err.code === '23505') {
            res.status(400).json({ error: 'Payslip already exists for this employee and month/year' });
        } else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

// Get payslip history
app.get('/api/payslips/history', async (req, res) => {
    const { search, month, year } = req.query;

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

    query += ' ORDER BY TO_DATE(month_year, \'Month YYYY\') DESC, employee_id';

    try {
        const result = await pool.query(query, params);
        console.log(`[${new Date().toISOString()}] Fetched ${result.rowCount} payslips`);
        res.json(result.rows);
    } catch (err) {
        logError('Payslip history fetch error', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get single payslip by ID
app.get('/api/payslips/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('SELECT * FROM payslips WHERE payslip_id = $1', [id]);

        if (result.rowCount === 0) {
            logError('Payslip fetch error', new Error(`Payslip not found: ${id}`));
            return res.status(404).json({ error: 'Payslip not found' });
        }

        console.log(`[${new Date().toISOString()}] Fetched payslip: ${id}`);
        res.json(result.rows[0]);
    } catch (err) {
        logError('Payslip fetch error', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Catch invalid routes
app.use((req, res) => {
    logError('Invalid route accessed', new Error(`Route not found: ${req.originalUrl}`));
    res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[${new Date().toISOString()}] Server running on http://3.88.203.125:${PORT}`);
    console.log(`Also accessible at http://localhost:${PORT}`);
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (err) => {
    logError('Uncaught Exception', err);
});

process.on('unhandledRejection', (err) => {
    logError('Unhandled Rejection', err);
});