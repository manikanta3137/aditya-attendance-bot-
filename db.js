const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const dbDir = process.env.DATABASE_PATH || __dirname;
const dbPath = path.join(dbDir, 'attendance.json');

// MongoDB Cloud Connection Details
const MONGODB_URI = process.env.MONGODB_URI;
let mongoClient = null;

// Async helper to establish database collection connection
async function getCollection() {
    if (!MONGODB_URI) return null;
    try {
        if (!mongoClient) {
            mongoClient = new MongoClient(MONGODB_URI);
            await mongoClient.connect();
            console.log('[Database] MongoDB Atlas client connected successfully.');
        }
        const dbName = mongoClient.options.dbName || 'attendance_bot';
        return mongoClient.db(dbName).collection('students');
    } catch (err) {
        console.error('[Database] Failed to connect to MongoDB Atlas:', err.message);
        // Force reset client to retry connection on next call
        mongoClient = null;
        return null;
    }
}

/* ==========================================================
   LOCAL JSON FILE STORAGE FALLBACK HELPERS
   ========================================================== */

// Helper to read database with auto-seeding fallback
function readDatabase() {
    try {
        if (!fs.existsSync(dbPath) || fs.readFileSync(dbPath, 'utf8').trim() === '[]' || fs.readFileSync(dbPath, 'utf8').trim() === '') {
            // Auto-seed from database.js if attendance.json is missing or empty
            const dbJsPath = path.join(__dirname, 'database.js');
            if (fs.existsSync(dbJsPath)) {
                console.log('[Local DB] Database missing or empty. Auto-seeding from database.js...');
                const content = fs.readFileSync(dbJsPath, 'utf8');
                const jsonStartIdx = content.indexOf('[');
                const jsonEndIdx = content.lastIndexOf(']') + 1;
                if (jsonStartIdx !== -1 && jsonEndIdx > 0) {
                    const jsonStr = content.substring(jsonStartIdx, jsonEndIdx);
                    const students = JSON.parse(jsonStr);
                    fs.writeFileSync(dbPath, JSON.stringify(students, null, 4), 'utf8');
                    console.log(`[Local DB] Auto-seeded ${students.length} students successfully.`);
                    return students;
                }
            }
            
            // Fallback if database.js doesn't exist
            fs.writeFileSync(dbPath, JSON.stringify([]));
            return [];
        }
        const data = fs.readFileSync(dbPath, 'utf8');
        return JSON.parse(data || '[]');
    } catch (err) {
        console.error('[Local DB] Error reading attendance.json:', err.message);
        return [];
    }
}

// Helper to write database
function writeDatabase(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 4), 'utf8');
        return true;
    } catch (err) {
        console.error('[Local DB] Error writing to attendance.json:', err.message);
        return false;
    }
}

/* ==========================================================
   PUBLIC DATABASE INTERFACE (MONGODB OR LOCAL FALLBACK)
   ========================================================== */

// Initialize schema (creates JSON if missing or seeds MongoDB if empty)
async function initializeSchema() {
    const col = await getCollection();
    if (col) {
        try {
            const count = await col.countDocuments();
            if (count === 0) {
                console.log('[Database] MongoDB collection is empty. Auto-seeding from database.js...');
                const dbJsPath = path.join(__dirname, 'database.js');
                if (fs.existsSync(dbJsPath)) {
                    const content = fs.readFileSync(dbJsPath, 'utf8');
                    const jsonStartIdx = content.indexOf('[');
                    const jsonEndIdx = content.lastIndexOf(']') + 1;
                    if (jsonStartIdx !== -1 && jsonEndIdx > 0) {
                        const jsonStr = content.substring(jsonStartIdx, jsonEndIdx);
                        const students = JSON.parse(jsonStr);
                        const formatted = students.map(s => ({
                            roll: s.roll.toUpperCase().trim(),
                            name: s.name.trim(),
                            branch: s.branch.toUpperCase().trim(),
                            phone: (s.phone || "").trim(),
                            subjects: s.subjects || {}
                        }));
                        await col.insertMany(formatted);
                        console.log(`[Database] Auto-seeded ${formatted.length} students into MongoDB successfully.`);
                    }
                }
            }
            console.log('[Database] MongoDB cloud schema verified.');
        } catch (err) {
            console.error('[Database] Failed to initialize MongoDB schema:', err.message);
        }
    } else {
        readDatabase(); // Trigger local auto-seeding on init
        console.log('[Local DB] Local file schema verified: attendance.json');
    }
}

// Query helper: get all students with optional search
async function getStudents(searchQuery = "") {
    const col = await getCollection();
    if (col) {
        try {
            let filter = {};
            if (searchQuery) {
                const q = searchQuery.trim();
                filter = {
                    $or: [
                        { name: { $regex: q, $options: 'i' } },
                        { roll: { $regex: q, $options: 'i' } },
                        { branch: { $regex: q, $options: 'i' } }
                    ]
                };
            }
            return await col.find(filter).toArray();
        } catch (err) {
            console.error('[Database] MongoDB error in getStudents:', err.message);
            // fallback to local JSON database if MongoDB fails mid-execution
        }
    }

    // Local JSON Fallback
    const students = readDatabase();
    if (!searchQuery) return students;

    const q = searchQuery.toLowerCase().trim();
    return students.filter(s => 
        s.name.toLowerCase().includes(q) || 
        s.roll.toLowerCase().includes(q) || 
        s.branch.toLowerCase().includes(q)
    );
}

// Query helper: get single student by roll
async function getStudentByRoll(roll) {
    const col = await getCollection();
    const uRoll = roll.toUpperCase().trim();

    if (col) {
        try {
            return await col.findOne({ roll: uRoll }) || null;
        } catch (err) {
            console.error('[Database] MongoDB error in getStudentByRoll:', err.message);
        }
    }

    const students = readDatabase();
    return students.find(s => s.roll.toUpperCase() === uRoll) || null;
}

// Query helper: add new student
async function addStudent(student) {
    const col = await getCollection();
    const uRoll = student.roll.toUpperCase().trim();

    if (col) {
        try {
            const exists = await col.findOne({ roll: uRoll });
            if (exists) {
                throw new Error(`Student with roll ${uRoll} already exists.`);
            }
            await col.insertOne({
                roll: uRoll,
                name: student.name.trim(),
                branch: student.branch.toUpperCase().trim(),
                phone: (student.phone || "").trim(),
                subjects: student.subjects || {}
            });
            return { success: true };
        } catch (err) {
            console.error('[Database] MongoDB error in addStudent:', err.message);
            throw err;
        }
    }

    const students = readDatabase();
    if (students.some(s => s.roll.toUpperCase() === uRoll)) {
        throw new Error(`Student with roll ${uRoll} already exists.`);
    }

    students.push({
        roll: uRoll,
        name: student.name.trim(),
        branch: student.branch.toUpperCase().trim(),
        phone: (student.phone || "").trim(),
        subjects: student.subjects || {}
    });

    writeDatabase(students);
    return { success: true };
}

// Query helper: update student details
async function updateStudent(roll, studentData) {
    const col = await getCollection();
    const uRoll = roll.toUpperCase().trim();

    if (col) {
        try {
            const updateDoc = {};
            if (studentData.name) updateDoc.name = studentData.name.trim();
            if (studentData.branch) updateDoc.branch = studentData.branch.toUpperCase().trim();
            if (studentData.phone !== undefined) updateDoc.phone = studentData.phone.trim();
            if (studentData.subjects) updateDoc.subjects = studentData.subjects;

            const result = await col.updateOne({ roll: uRoll }, { $set: updateDoc });
            if (result.matchedCount === 0) {
                throw new Error('Student record not found.');
            }
            return { success: true };
        } catch (err) {
            console.error('[Database] MongoDB error in updateStudent:', err.message);
            throw err;
        }
    }

    const students = readDatabase();
    const index = students.findIndex(s => s.roll.toUpperCase() === uRoll);

    if (index === -1) {
        throw new Error('Student record not found.');
    }

    if (studentData.name) students[index].name = studentData.name.trim();
    if (studentData.branch) students[index].branch = studentData.branch.toUpperCase().trim();
    if (studentData.phone !== undefined) students[index].phone = studentData.phone.trim();
    if (studentData.subjects) students[index].subjects = studentData.subjects;

    writeDatabase(students);
    return { success: true };
}

// Query helper: delete student record
async function deleteStudent(roll) {
    const col = await getCollection();
    const uRoll = roll.toUpperCase().trim();

    if (col) {
        try {
            const result = await col.deleteOne({ roll: uRoll });
            return { changes: result.deletedCount };
        } catch (err) {
            console.error('[Database] MongoDB error in deleteStudent:', err.message);
            throw err;
        }
    }

    const students = readDatabase();
    const filtered = students.filter(s => s.roll.toUpperCase() !== uRoll);

    if (students.length === filtered.length) {
        return { changes: 0 };
    }

    writeDatabase(filtered);
    return { changes: 1 };
}

// Query helper: bulk overwrite
async function importAll(studentList) {
    const col = await getCollection();
    const formatted = studentList.map(s => ({
        roll: s.roll.toUpperCase().trim(),
        name: s.name.trim(),
        branch: s.branch.toUpperCase().trim(),
        phone: (s.phone || "").trim(),
        subjects: s.subjects || {}
    }));

    if (col) {
        try {
            await col.deleteMany({});
            if (formatted.length > 0) {
                await col.insertMany(formatted);
            }
            return true;
        } catch (err) {
            console.error('[Database] MongoDB error in importAll:', err.message);
            throw err;
        }
    }

    writeDatabase(formatted);
    return true;
}

module.exports = {
    initializeSchema,
    getStudents,
    getStudentByRoll,
    addStudent,
    updateStudent,
    deleteStudent,
    importAll
};
