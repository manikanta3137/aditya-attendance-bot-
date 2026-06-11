require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-12345';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static dashboard files
app.use(express.static(path.join(__dirname, 'public')));

// Simulated sessions for WhatsApp Chatbot
// Key: Phone Number (From), Value: { step, selectedBranch, lastRollNumber }
const sessions = new Map();

/* ==========================================
   DIRECT WHATSAPP WEB CLIENT INITIALIZATION
   ========================================== */
// Detect local Google Chrome installation on Windows
const fs = require('fs');
const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe')
];

let systemChromePath = '';
for (const p of chromePaths) {
    if (p && fs.existsSync(p)) {
        systemChromePath = p;
        console.log('Detected local Google Chrome at:', systemChromePath);
        break;
    }
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || systemChromePath || undefined, // Use env or local Chrome to bypass Chromium download
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

let isWhatsAppReady = false;

client.on('qr', async (qr) => {
    console.log('\n==================================================================');
    console.log('   ⚠️ SCAN THE QR CODE BELOW WITH YOUR WHATSAPP LINKED DEVICES   ');
    console.log('==================================================================\n');
    qrcodeTerminal.generate(qr, { small: true });
    console.log('\n==================================================================\n');

    // Generate QR code as PNG image inside public folder
    try {
        const qrPath = path.join(__dirname, 'public', 'qr.png');
        await QRCode.toFile(qrPath, qr, {
            color: {
                dark: '#0f172a', // Slate-900 color for dark aesthetic
                light: '#ffffff'
            },
            width: 300
        });
        console.log('Generated QR image at public/qr.png');
    } catch (err) {
        console.error('Failed to generate QR image file:', err.message);
    }
});

client.on('ready', () => {
    isWhatsAppReady = true;
    console.log('\n==================================================================');
    console.log('      🎉 SUCCESS: WhatsApp Client is Ready and Logged In!         ');
    console.log('==================================================================\n');

    // Delete QR image when successfully connected
    try {
        const qrPath = path.join(__dirname, 'public', 'qr.png');
        if (fs.existsSync(qrPath)) {
            fs.unlinkSync(qrPath);
            console.log('Cleaned up public/qr.png');
        }
    } catch (e) {
        console.error('Failed to delete QR image:', e.message);
    }
});

client.on('auth_failure', (msg) => {
    console.error('WhatsApp Authentication failure:', msg);
});

client.on('disconnected', (reason) => {
    isWhatsAppReady = false;
    console.warn('WhatsApp Client was disconnected:', reason);
});

/* ==========================================
   WHATSAPP CHATBOT CONVERSATION FLOW
   ========================================== */
client.on('message_create', async (msg) => {
    const from = msg.from; // e.g. '919876543210@c.us'
    const body = msg.body ? msg.body.trim() : '';
    const bodyUpper = body.toUpperCase();

    // Ignore group chats
    if (from && from.endsWith('@g.us')) return;

    // Prevent loop: ignore messages sent by the bot to others,
    // but allow messages sent by the user to themselves (self-chats).
    if (msg.fromMe) {
        const myJid = client.info && client.info.wid && client.info.wid._serialized;
        if (!myJid || msg.to !== myJid) {
            return;
        }
    }

    // Check if sender is HOD / Admin
    const isAdmin = from.includes('9398881606');
    if (isAdmin) {
        let session = sessions.get(from);
        if (!session || bodyUpper === 'RESET' || bodyUpper === 'START' || bodyUpper === 'HI' || bodyUpper === 'HELLO' || bodyUpper === 'MENU') {
            session = { step: 'ADMIN_MENU' };
            sessions.set(from, session);
            
            const menuText = `👑 *HOD / Admin Control Menu*
Welcome back! You have administrative access to Aditya University attendance records.

*Commands:*
• Enter any *Roll Number* (e.g. *23CSE001*) to view their attendance report directly.
• Type *SUMMARY* to view students with low attendance (<75%).
• Type *ALERT ALL* to broadcast warning messages to all low attendance students.
• Type *RESET* to return to this menu.`;
            await msg.reply(menuText);
            return;
        }

        try {
            if (session.step === 'CONFIRM_ALERT_ALL') {
                if (bodyUpper === 'CONFIRM ALERT') {
                    await msg.reply('⏳ Broadcasting warnings to students... Please wait.');
                    const students = await db.getStudents();
                    let count = 0;
                    
                    for (const student of students) {
                        if (!student.phone) continue;
                        
                        // Calculate attendance
                        let totalAttended = 0;
                        let totalConducted = 0;
                        for (let subName in student.subjects) {
                            const sub = student.subjects[subName];
                            totalAttended += parseInt(sub.attended) || 0;
                            totalConducted += parseInt(sub.conducted) || 0;
                        }
                        
                        const overallPct = totalConducted > 0 ? (totalAttended / totalConducted) * 100 : 0;
                        if (overallPct < 75.0) {
                            const cleanPhone = student.phone.replace(/\D/g, '');
                            if (cleanPhone) {
                                const targetJid = cleanPhone.includes('@c.us') ? cleanPhone : `${cleanPhone}@c.us`;
                                const classesToAttend = Math.max(0, Math.ceil(3 * totalConducted - 4 * totalAttended));
                                const adviceText = `You need to attend *${classesToAttend}* more consecutive classes to maintain *75%* attendance.`;
                                
                                const alertMessageText = `📋 *ATTENDANCE WARNING*
👤 *Name:* ${student.name}
🆔 *Roll No:* ${student.roll}
📊 *Overall Attendance:* *${overallPct.toFixed(1)}%*
💡 *Status:* ${adviceText}

_Please login to your student portal or contact HOD for subject-wise details._`;
                                
                                try {
                                    await client.sendMessage(targetJid, alertMessageText);
                                    count++;
                                } catch (sendErr) {
                                    console.error(`Failed to broadcast to ${targetJid}:`, sendErr.message);
                                }
                            }
                        }
                    }
                    
                    session.step = 'ADMIN_MENU';
                    await msg.reply(`✅ *Broadcast Complete!*\nSuccessfully sent warning messages to *${count}* students.`);
                } else {
                    session.step = 'ADMIN_MENU';
                    await msg.reply('❌ Broadcast cancelled. Returned to Admin Menu.');
                }
                return;
            }

            if (bodyUpper === 'SUMMARY') {
                const students = await db.getStudents();
                let lowAttList = [];
                
                students.forEach(student => {
                    let totalAttended = 0;
                    let totalConducted = 0;
                    for (let subName in student.subjects) {
                        const sub = student.subjects[subName];
                        totalAttended += parseInt(sub.attended) || 0;
                        totalConducted += parseInt(sub.conducted) || 0;
                    }
                    const overallPct = totalConducted > 0 ? (totalAttended / totalConducted) * 100 : 0;
                    if (overallPct < 75.0) {
                        lowAttList.push({
                            roll: student.roll,
                            name: student.name,
                            branch: student.branch,
                            pct: overallPct
                        });
                    }
                });

                if (lowAttList.length === 0) {
                    await msg.reply('🎉 All students currently maintain attendance at or above *75%*!');
                    return;
                }

                // Sort by attendance ascending
                lowAttList.sort((a, b) => a.pct - b.pct);

                let summaryText = `📊 *Low Attendance Summary (<75%)*\nTotal students below criteria: *${lowAttList.length}*\n\n`;
                
                // Show up to 25 students
                const maxToShow = 25;
                const listToShow = lowAttList.slice(0, maxToShow);
                listToShow.forEach((s, idx) => {
                    summaryText += `${idx + 1}. *${s.roll}* - ${s.name} (${s.branch}): *${s.pct.toFixed(1)}%*\n`;
                });

                if (lowAttList.length > maxToShow) {
                    summaryText += `\n_...and ${lowAttList.length - maxToShow} more. Please view the Faculty Dashboard for the full list._`;
                }

                summaryText += `\n\n_Type *ALERT ALL* to send warnings to all of them._`;
                await msg.reply(summaryText);
                return;
            }

            if (bodyUpper === 'ALERT ALL') {
                session.step = 'CONFIRM_ALERT_ALL';
                const confirmText = `⚠️ *CONFIRM BROADCAST*
You are about to send warning messages to all students with overall attendance *below 75%*.

To verify and send, type exactly: *CONFIRM ALERT*
To cancel and return, type anything else.`;
                await msg.reply(confirmText);
                return;
            }

            // Assume it is a roll number query
            const student = await db.getStudentByRoll(bodyUpper);
            if (student) {
                let totalAttended = 0;
                let totalConducted = 0;
                let breakdownText = '';

                for (let subName in student.subjects) {
                    const sub = student.subjects[subName];
                    totalAttended += parseInt(sub.attended) || 0;
                    totalConducted += parseInt(sub.conducted) || 0;
                    const pct = sub.conducted > 0 ? ((sub.attended / sub.conducted) * 100).toFixed(1) : '0.0';
                    const statusIcon = parseFloat(pct) >= 75.0 ? '🟢' : '🔴';
                    breakdownText += `\n${statusIcon} *${subName}:* ${sub.attended}/${sub.conducted} (${pct}%)`;
                }

                const overallPct = totalConducted > 0 ? ((totalAttended / totalConducted) * 100).toFixed(1) : '0.0';
                const overallPctNum = parseFloat(overallPct);

                let advice = '';
                if (overallPctNum < 75.0) {
                    const classesToAttend = Math.max(0, Math.ceil(3 * totalConducted - 4 * totalAttended));
                    advice = `⚠️ *Action Required:* Student needs to attend *${classesToAttend}* more consecutive classes to reach *75%*.`;
                } else {
                    const classesToSkip = Math.max(0, Math.floor((4 * totalAttended) / 3 - totalConducted));
                    advice = `✅ *Good Standing:* Student can miss up to *${classesToSkip}* classes consecutively.`;
                }

                const responseText = `📋 *ATTENDANCE REPORT (ADMIN VIEW)*
👤 *Name:* ${student.name}
🆔 *Roll No:* ${student.roll}
🎓 *Branch:* ${student.branch}
📞 *Phone:* ${student.phone || 'Not configured'}
------------------------------
📚 *Subject Breakdown:*${breakdownText}
------------------------------
📊 *Overall:* ${totalAttended}/${totalConducted} conducted (*${overallPct}%*)

${advice}

_Enter another Roll Number or type *RESET* to view Admin Menu._`;
                await msg.reply(responseText);
            } else {
                await msg.reply(`❌ Roll Number or command *${body}* not recognized.\n\nType *RESET* to open the HOD/Admin Control Menu.`);
            }

        } catch (err) {
            console.error('Error in Admin chatbot flow:', err.message);
            await msg.reply('⚠️ Sorry, there was an error processing your query. Type *RESET* to retry.');
        }
        return;
    }

    // Check session or reset
    let session = sessions.get(from);
    if (!session || bodyUpper === 'RESET' || bodyUpper === 'START' || bodyUpper === 'HI' || bodyUpper === 'HELLO' || bodyUpper === 'MENU') {
        session = { step: 'WELCOME', selectedBranch: '', lastRollNumber: '' };
        sessions.set(from, session);
    }

    let responseText = '';

    try {
        // Fetch branches dynamically from DB
        const students = await db.getStudents();
        const branches = Array.from(new Set(students.map(s => s.branch.toUpperCase())));

        if (session.step === 'WELCOME') {
            // Check if user replied with a valid branch
            if (branches.includes(bodyUpper)) {
                session.selectedBranch = bodyUpper;
                session.step = 'BRANCH_SELECTED';
                responseText = `Selected Branch: *${bodyUpper}*.\n\nPlease type your *Roll Number* to fetch your attendance report (e.g. 23CSE001):`;
            } else {
                let branchesListText = branches.map(b => `• *${b}*`).join('\n');
                responseText = `👋 *Welcome to the Aditya University Attendance Bot!*\n\nPlease select or type your *Branch Code* from the options below to get started:\n\n${branchesListText}\n\n_(Reply with the exact branch code, e.g. CSE)_`;
            }
        } 
        
        else if (session.step === 'BRANCH_SELECTED') {
            // Find student
            const student = await db.getStudentByRoll(bodyUpper);
            
            if (student && student.branch.toUpperCase() === session.selectedBranch) {
                session.lastRollNumber = bodyUpper;
                session.step = 'RESULTS';
                
                let totalAttended = 0;
                let totalConducted = 0;
                let breakdownText = '';

                for (let subName in student.subjects) {
                    const sub = student.subjects[subName];
                    totalAttended += sub.attended;
                    totalConducted += sub.conducted;
                    const pct = sub.conducted > 0 ? ((sub.attended / sub.conducted) * 100).toFixed(1) : '0.0';
                    const statusIcon = parseFloat(pct) >= 75.0 ? '🟢' : '🔴';
                    breakdownText += `\n${statusIcon} *${subName}:* ${sub.attended}/${sub.conducted} (${pct}%)`;
                }

                const overallPct = totalConducted > 0 ? ((totalAttended / totalConducted) * 100).toFixed(1) : '0.0';
                const overallPctNum = parseFloat(overallPct);

                let advice = '';
                if (overallPctNum < 75.0) {
                    const classesToAttend = Math.max(0, Math.ceil(3 * totalConducted - 4 * totalAttended));
                    advice = `⚠️ *Action Required:* You need to attend *${classesToAttend}* more consecutive classes to reach *75%* overall attendance. Currently at *${overallPct}%*.`;
                } else {
                    const classesToSkip = Math.max(0, Math.floor((4 * totalAttended) / 3 - totalConducted));
                    advice = `✅ *Good Standing:* You can miss up to *${classesToSkip}* classes consecutively and still maintain at least *75%* overall attendance. Currently at *${overallPct}%*.`;
                }

                responseText = `📋 *ATTENDANCE REPORT*
👤 *Name:* ${student.name}
🆔 *Roll No:* ${student.roll}
🎓 *Branch:* ${student.branch}
------------------------------
📚 *Subject Breakdown:*${breakdownText}
------------------------------
📊 *Overall:* ${totalAttended}/${totalConducted} conducted (*${overallPct}%*)

${advice}

_Type *RESET* to check another student._`;
            } else {
                responseText = `❌ Roll Number *${body}* not found in the *${session.selectedBranch}* branch.\n\nPlease type your roll number again, or reply *RESET* to change branch.`;
            }
        } 
        
        else if (session.step === 'RESULTS') {
            // Any message resets in this state
            session.step = 'WELCOME';
            session.selectedBranch = '';
            let branchesListText = branches.map(b => `• *${b}*`).join('\n');
            responseText = `👋 *Check Another Record*\n\nPlease select or type a *Branch Code* to start:\n\n${branchesListText}`;
        }

        // Direct Reply using whatsapp-web.js
        await msg.reply(responseText);

    } catch (err) {
        console.error('Error in chatbot flow:', err.message);
        try {
            await msg.reply(`⚠️ Sorry, there was an error processing your query. Please type *RESET* to try again.`);
        } catch(e) {}
    }
});

// Initialize WhatsApp Client
client.initialize();

/* ==========================================
   JWT AUTHENTICATION MIDDLEWARE
   ========================================== */
function authenticateJWT(req, res, next) {
    const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Forbidden: Invalid token' });
        }
        req.user = user;
        next();
    });
}

/* ==========================================
   FACULTY AUTH ENDPOINTS
   ========================================== */
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if ((username === 'admin' && password === 'admin123') || (username === 'faculty' && password === 'faculty123')) {
        const token = jwt.sign({ username, role: 'faculty' }, JWT_SECRET, { expiresIn: '2h' });
        
        // Send cookie (HttpOnly for security)
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 2 * 60 * 60 * 1000 // 2 hours
        });

        return res.json({ success: true, username, role: 'faculty' });
    }

    return res.status(400).json({ error: 'Invalid username or password' });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

app.post('/api/logout-whatsapp', authenticateJWT, async (req, res) => {
    try {
        // Even if isWhatsAppReady is false, try to call logout to clean up files
        await client.logout();
        isWhatsAppReady = false;
        res.json({ success: true, message: 'Successfully logged out of WhatsApp' });
    } catch (err) {
        // Fallback: delete auth folder if logout fails due to connection issues
        try {
            isWhatsAppReady = false;
            res.json({ success: true, message: 'Logged out with local session cleared' });
        } catch (e) {
            res.status(500).json({ error: 'Failed to log out of WhatsApp: ' + err.message });
        }
    }
});

app.get('/api/me', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.json({ authenticated: false });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.json({ authenticated: false });
        res.json({ authenticated: true, username: user.username });
    });
});

app.get('/api/status', (req, res) => {
    const qrAvailable = fs.existsSync(path.join(__dirname, 'public', 'qr.png'));
    res.json({
        whatsappReady: isWhatsAppReady,
        qrAvailable: qrAvailable
    });
});

/* ==========================================
   STUDENT DATABASE REST API (CRUD)
   ========================================== */

// GET all students
app.get('/api/students', authenticateJWT, async (req, res) => {
    try {
        const query = req.query.search || '';
        const students = await db.getStudents(query);
        res.json(students);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch records: ' + err.message });
    }
});

// GET single student details
app.get('/api/students/:roll', authenticateJWT, async (req, res) => {
    try {
        const roll = req.params.roll;
        const student = await db.getStudentByRoll(roll);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }
        res.json(student);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Add Student
app.post('/api/students', authenticateJWT, async (req, res) => {
    const { roll, name, branch, phone, subjects } = req.body;
    if (!roll || !name || !branch) {
        return res.status(400).json({ error: 'Roll, Name, and Branch are required fields' });
    }

    try {
        await db.addStudent({ roll, name, branch, phone, subjects });
        res.json({ success: true, message: 'Student added successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT Update Student
app.put('/api/students/:roll', authenticateJWT, async (req, res) => {
    const roll = req.params.roll;
    const { name, branch, phone, subjects } = req.body;

    try {
        await db.updateStudent(roll, { name, branch, phone, subjects });
        res.json({ success: true, message: 'Student record updated successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE Student
app.delete('/api/students/:roll', authenticateJWT, async (req, res) => {
    const roll = req.params.roll;
    try {
        const result = await db.deleteStudent(roll);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Student record not found' });
        }
        res.json({ success: true, message: 'Student record deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Send Outbound WhatsApp Alert (Direct)
app.post('/api/students/:roll/send-alert', authenticateJWT, async (req, res) => {
    const roll = req.params.roll;
    try {
        const student = await db.getStudentByRoll(roll);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        if (!student.phone) {
            return res.status(400).json({ error: 'Student does not have a phone number configured' });
        }

        // Calculate attendance stats
        let totalAttended = 0;
        let totalConducted = 0;
        for (let subName in student.subjects) {
            const sub = student.subjects[subName];
            totalAttended += sub.attended;
            totalConducted += sub.conducted;
        }

        const overallPct = totalConducted > 0 ? ((totalAttended / totalConducted) * 100).toFixed(1) : '0.0';
        const overallPctNum = parseFloat(overallPct);

        let adviceText = '';
        if (overallPctNum < 75.0) {
            const classesToAttend = Math.max(0, Math.ceil(3 * totalConducted - 4 * totalAttended));
            adviceText = `You need to attend *${classesToAttend}* more consecutive classes to maintain *75%* attendance.`;
        } else {
            const classesToSkip = Math.max(0, Math.floor((4 * totalAttended) / 3 - totalConducted));
            adviceText = `You are in good standing! You can miss up to *${classesToSkip}* classes consecutively.`;
        }

        // Format message content
        const alertMessageText = `📋 *ATTENDANCE WARNING*
👤 *Name:* ${student.name}
🆔 *Roll No:* ${student.roll}
📊 *Overall Attendance:* *${overallPct}%*
💡 *Status:* ${adviceText}

_Please login to your student portal or contact HOD for subject-wise details._`;

        // Strip non-digits from phone number
        const cleanPhone = student.phone.replace(/\D/g, '');
        if (!cleanPhone) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }

        // Format JID for WhatsApp
        const targetJid = cleanPhone.includes('@c.us') ? cleanPhone : `${cleanPhone}@c.us`;

        // If WhatsApp client is not linked yet, run in demo mode
        if (!isWhatsAppReady) {
            console.log(`[SIMULATED DIRECT WHATSAPP ALERT]`);
            console.log(`To: ${targetJid}`);
            console.log(`Message:\n----------\n${alertMessageText}\n----------`);
            
            return res.json({ 
                success: true, 
                simulated: true, 
                message: `[Demo Mode] Simulated direct alert sent to ${student.name} at ${student.phone}. Connect WhatsApp to send live.` 
            });
        }

        // Send direct message using linked WhatsApp account
        const message = await client.sendMessage(targetJid, alertMessageText);
        res.json({ success: true, simulated: false, messageId: message.id.id });

    } catch (err) {
        res.status(500).json({ error: 'Failed to send WhatsApp message: ' + err.message });
    }
});

// POST CSV Import
app.post('/api/import-csv', authenticateJWT, async (req, res) => {
    const { csvText } = req.body;
    if (!csvText || !csvText.trim()) {
        return res.status(400).json({ error: 'No CSV content provided' });
    }

    try {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            return res.status(400).json({ error: 'CSV must contain a header and at least one data row' });
        }

        // Parse header
        const headers = parseCSVLine(lines[0]);
        if (headers.length < 5) {
            return res.status(400).json({ error: 'CSV layout invalid. Required format: RollNumber,Name,Branch,Subject1_Attended,Subject1_Conducted,...' });
        }

        // Identify subject indices
        const subjectIndices = [];
        for (let i = 3; i < headers.length; i += 2) {
            const attHeader = headers[i];
            const condHeader = headers[i+1];
            if (!attHeader || !condHeader) break;
            const subName = attHeader.replace(/_Attended/i, '').replace(/_/g, ' ');
            subjectIndices.push({ name: subName, attIdx: i, codIdx: i + 1 });
        }

        const parsedStudents = [];

        for (let j = 1; j < lines.length; j++) {
            if (!lines[j].trim()) continue;
            const values = parseCSVLine(lines[j]);
            if (values.length < 3) continue;

            const roll = values[0].trim().toUpperCase();
            const name = values[1].trim();
            const branch = values[2].trim().toUpperCase();

            // Set phone as empty string since CSV doesn't specify it, or set optional
            const phone = "";

            const subjects = {};
            subjectIndices.forEach(sub => {
                const attVal = parseInt(values[sub.attIdx]) || 0;
                const condVal = parseInt(values[sub.attIdx + 1]) || 0; // index next to attended
                subjects[sub.name] = { attended: attVal, conducted: condVal };
            });

            parsedStudents.push({ roll, name, branch, phone, subjects });
        }

        // Bulk import overwrite
        await db.importAll(parsedStudents);
        res.json({ success: true, message: 'CSV imported successfully' });

    } catch (err) {
        res.status(500).json({ error: 'CSV Import failed: ' + err.message });
    }
});

// GET CSV Export
app.get('/api/export-csv', authenticateJWT, async (req, res) => {
    try {
        const students = await db.getStudents();
        if (students.length === 0) return res.send('');

        // Find all distinct subjects across database
        const subjectsSet = new Set();
        students.forEach(s => {
            Object.keys(s.subjects).forEach(sub => subjectsSet.add(sub));
        });
        const subjectsArray = Array.from(subjectsSet);

        // Header
        let csv = 'RollNumber,Name,Branch';
        subjectsArray.forEach(sub => {
            const cleanSub = sub.replace(/,/g, '');
            csv += `,${cleanSub}_Attended,${cleanSub}_Conducted`;
        });
        csv += '\n';

        // Rows
        students.forEach(s => {
            let row = `"${s.roll}","${s.name.replace(/"/g, '""')}","${s.branch}"`;
            subjectsArray.forEach(sub => {
                const att = s.subjects[sub] ? s.subjects[sub].attended : 0;
                const cond = s.subjects[sub] ? s.subjects[sub].conducted : 0;
                row += `,${att},${cond}`;
            });
            csv += row + '\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=students_attendance.csv');
        res.send(csv);

    } catch (err) {
        res.status(500).json({ error: 'Export failed: ' + err.message });
    }
});

// Helper CSV parser
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
