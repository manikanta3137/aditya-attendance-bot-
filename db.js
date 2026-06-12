const fs = require('fs');
const path = require('path');

const dbDir = process.env.DATABASE_PATH || __dirname;
const dbPath = path.join(dbDir, 'attendance.json');

// Helper to read database with auto-seeding fallback
function readDatabase() {
    try {
        if (!fs.existsSync(dbPath) || fs.readFileSync(dbPath, 'utf8').trim() === '[]' || fs.readFileSync(dbPath, 'utf8').trim() === '') {
            // Auto-seed from database.js if attendance.json is missing or empty
            const dbJsPath = path.join(__dirname, 'database.js');
            if (fs.existsSync(dbJsPath)) {
                console.log('Database missing or empty. Auto-seeding from database.js...');
                const content = fs.readFileSync(dbJsPath, 'utf8');
                const jsonStartIdx = content.indexOf('[');
                const jsonEndIdx = content.lastIndexOf(']') + 1;
                if (jsonStartIdx !== -1 && jsonEndIdx > 0) {
                    const jsonStr = content.substring(jsonStartIdx, jsonEndIdx);
                    const students = JSON.parse(jsonStr);
                    fs.writeFileSync(dbPath, JSON.stringify(students, null, 4), 'utf8');
                    console.log(`Auto-seeded ${students.length} students successfully.`);
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
        console.error('Error reading attendance.json:', err.message);
        return [];
    }
}

// Helper to write database
function writeDatabase(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 4), 'utf8');
        return true;
    } catch (err) {
        console.error('Error writing to attendance.json:', err.message);
        return false;
    }
}

// Initialize schema (creates JSON if missing)
async function initializeSchema() {
    readDatabase(); // Trigger auto-seeding on init
    console.log('JSON file database initialized: attendance.json');
}

// Query helper: get all students with optional search
async function getStudents(searchQuery = "") {
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
    const students = readDatabase();
    const uRoll = roll.toUpperCase().trim();
    return students.find(s => s.roll.toUpperCase() === uRoll) || null;
}

// Query helper: add new student
async function addStudent(student) {
    const students = readDatabase();
    const uRoll = student.roll.toUpperCase().trim();

    // Check duplicate
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
    const students = readDatabase();
    const uRoll = roll.toUpperCase().trim();
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
    const students = readDatabase();
    const uRoll = roll.toUpperCase().trim();
    const filtered = students.filter(s => s.roll.toUpperCase() !== uRoll);

    if (students.length === filtered.length) {
        return { changes: 0 };
    }

    writeDatabase(filtered);
    return { changes: 1 };
}

// Query helper: bulk overwrite
async function importAll(studentList) {
    const formatted = studentList.map(s => ({
        roll: s.roll.toUpperCase().trim(),
        name: s.name.trim(),
        branch: s.branch.toUpperCase().trim(),
        phone: (s.phone || "").trim(),
        subjects: s.subjects || {}
    }));
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
