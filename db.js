const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// Cloud Key-Value Storage details (Zero-Config Persistence)
const BUCKET_ID = 'HbtQAEHHEZMJSJzJdbrHJV';
const KVDB_URL = `https://kvdb.io/${BUCKET_ID}/attendance_data`;

// Local JSON File Fallback details
const dbDir = process.env.DATABASE_PATH || __dirname;
const dbPath = path.join(dbDir, 'attendance.json');

// MongoDB Cloud Connection details
const MONGODB_URI = process.env.MONGODB_URI;
let mongoClient = null;

// Memory cache to prevent redundant HTTP requests and speed up reads
let memoryCache = null;

/* ==========================================================
   HELPER: GET DATABASE CONNECTION (MONGODB OR CLOUD KV)
   ========================================================== */

async function getMongoCollection() {
    if (!MONGODB_URI) return null;
    try {
        if (!mongoClient) {
            mongoClient = new MongoClient(MONGODB_URI);
            await mongoClient.connect();
            console.log('[Database] MongoDB Atlas connected.');
        }
        const dbName = mongoClient.options.dbName || 'attendance_bot';
        return mongoClient.db(dbName).collection('students');
    } catch (err) {
        console.error('[Database] MongoDB connection failed:', err.message);
        mongoClient = null;
        return null;
    }
}

/* ==========================================================
   CLOUD KEY-VALUE STORAGE (kvdb.io) OPERATIONS
   ========================================================== */

// Read database from cloud KV store
async function readCloudKV() {
    if (memoryCache) return memoryCache;
    try {
        const res = await fetch(KVDB_URL);
        if (res.status === 404) {
            // Seed from database.js if cloud bucket key doesn't exist
            return await seedCloudKV();
        }
        if (!res.ok) {
            throw new Error(`Read failed: ${res.statusText}`);
        }
        const data = await res.json();
        memoryCache = data;
        return data;
    } catch (err) {
        console.error('[Cloud KV] Read error, falling back to local file:', err.message);
        return readLocalJSON();
    }
}

// Write database to cloud KV store
async function writeCloudKV(data) {
    memoryCache = data;
    try {
        const res = await fetch(KVDB_URL, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
            throw new Error(`Write failed: ${res.statusText}`);
        }
        return true;
    } catch (err) {
        console.error('[Cloud KV] Write error, falling back to local file:', err.message);
        writeLocalJSON(data);
        return false;
    }
}

// Seed cloud KV store from database.js
async function seedCloudKV() {
    const dbJsPath = path.join(__dirname, 'database.js');
    if (fs.existsSync(dbJsPath)) {
        console.log('[Cloud KV] Seeding cloud database from database.js...');
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
            await writeCloudKV(formatted);
            return formatted;
        }
    }
    return [];
}

/* ==========================================================
   LOCAL JSON FILE STORAGE FALLBACK HELPERS
   ========================================================== */

function readLocalJSON() {
    try {
        if (!fs.existsSync(dbPath)) {
            // Seed from database.js if missing
            const dbJsPath = path.join(__dirname, 'database.js');
            if (fs.existsSync(dbJsPath)) {
                const content = fs.readFileSync(dbJsPath, 'utf8');
                const jsonStartIdx = content.indexOf('[');
                const jsonEndIdx = content.lastIndexOf(']') + 1;
                if (jsonStartIdx !== -1 && jsonEndIdx > 0) {
                    const jsonStr = content.substring(jsonStartIdx, jsonEndIdx);
                    const students = JSON.parse(jsonStr);
                    fs.writeFileSync(dbPath, JSON.stringify(students, null, 4), 'utf8');
                    return students;
                }
            }
            fs.writeFileSync(dbPath, JSON.stringify([]));
            return [];
        }
        const data = fs.readFileSync(dbPath, 'utf8');
        return JSON.parse(data || '[]');
    } catch (err) {
        console.error('[Local DB] Read error:', err.message);
        return [];
    }
}

function writeLocalJSON(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 4), 'utf8');
        return true;
    } catch (err) {
        console.error('[Local DB] Write error:', err.message);
        return false;
    }
}

/* ==========================================================
   PUBLIC DATABASE INTERFACE
   ========================================================== */

// Initialize schema
async function initializeSchema() {
    const col = await getMongoCollection();
    if (col) {
        try {
            const count = await col.countDocuments();
            if (count === 0) {
                console.log('[Database] MongoDB empty. Auto-seeding...');
                const students = readLocalJSON();
                await col.insertMany(students);
            }
            console.log('[Database] MongoDB connection initialized.');
            return;
        } catch (err) {
            console.error('[Database] MongoDB init failed:', err.message);
        }
    }

    // Default to Cloud KV store initialization
    console.log('[Database] Initializing Cloud KV Store connection...');
    await readCloudKV();
    console.log('[Database] Cloud KV database initialized.');
}

// Query helper: get all students
async function getStudents(searchQuery = "") {
    const col = await getMongoCollection();
    let students = [];

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
            console.error('[Database] MongoDB getStudents error, falling back:', err.message);
        }
    }

    // Cloud KV Read
    students = await readCloudKV();
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
    const col = await getMongoCollection();
    const uRoll = roll.toUpperCase().trim();

    if (col) {
        try {
            return await col.findOne({ roll: uRoll }) || null;
        } catch (err) {
            console.error('[Database] MongoDB getStudentByRoll error, falling back:', err.message);
        }
    }

    const students = await readCloudKV();
    return students.find(s => s.roll.toUpperCase() === uRoll) || null;
}

// Query helper: add new student
async function addStudent(student) {
    const col = await getMongoCollection();
    const uRoll = student.roll.toUpperCase().trim();

    if (col) {
        try {
            const exists = await col.findOne({ roll: uRoll });
            if (exists) throw new Error(`Student with roll ${uRoll} already exists.`);
            
            await col.insertOne({
                roll: uRoll,
                name: student.name.trim(),
                branch: student.branch.toUpperCase().trim(),
                phone: (student.phone || "").trim(),
                subjects: student.subjects || {}
            });
            return { success: true };
        } catch (err) {
            console.error('[Database] MongoDB addStudent error:', err.message);
            throw err;
        }
    }

    const students = await readCloudKV();
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

    await writeCloudKV(students);
    return { success: true };
}

// Query helper: update student details
async function updateStudent(roll, studentData) {
    const col = await getMongoCollection();
    const uRoll = roll.toUpperCase().trim();

    if (col) {
        try {
            const updateDoc = {};
            if (studentData.name) updateDoc.name = studentData.name.trim();
            if (studentData.branch) updateDoc.branch = studentData.branch.toUpperCase().trim();
            if (studentData.phone !== undefined) updateDoc.phone = studentData.phone.trim();
            if (studentData.subjects) updateDoc.subjects = studentData.subjects;

            const result = await col.updateOne({ roll: uRoll }, { $set: updateDoc });
            if (result.matchedCount === 0) throw new Error('Student record not found.');
            return { success: true };
        } catch (err) {
            console.error('[Database] MongoDB updateStudent error:', err.message);
            throw err;
        }
    }

    const students = await readCloudKV();
    const index = students.findIndex(s => s.roll.toUpperCase() === uRoll);
    if (index === -1) throw new Error('Student record not found.');

    if (studentData.name) students[index].name = studentData.name.trim();
    if (studentData.branch) students[index].branch = studentData.branch.toUpperCase().trim();
    if (studentData.phone !== undefined) students[index].phone = studentData.phone.trim();
    if (studentData.subjects) students[index].subjects = studentData.subjects;

    await writeCloudKV(students);
    return { success: true };
}

// Query helper: delete student record
async function deleteStudent(roll) {
    const col = await getMongoCollection();
    const uRoll = roll.toUpperCase().trim();

    if (col) {
        try {
            const result = await col.deleteOne({ roll: uRoll });
            return { changes: result.deletedCount };
        } catch (err) {
            console.error('[Database] MongoDB deleteStudent error:', err.message);
            throw err;
        }
    }

    const students = await readCloudKV();
    const filtered = students.filter(s => s.roll.toUpperCase() !== uRoll);
    if (students.length === filtered.length) {
        return { changes: 0 };
    }

    await writeCloudKV(filtered);
    return { changes: 1 };
}

// Query helper: bulk overwrite
async function importAll(studentList) {
    const col = await getMongoCollection();
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
            console.error('[Database] MongoDB importAll error:', err.message);
            throw err;
        }
    }

    await writeCloudKV(formatted);
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
