const fs = require('fs');
const path = require('path');
const db = require('./db');

async function seed() {
    console.log('Running JSON database initialization...');
    await db.initializeSchema();
    
    // Load student records from database.js
    const dbJsPath = path.join(__dirname, 'database.js');
    if (!fs.existsSync(dbJsPath)) {
        console.error(`Error: Seed database file not found at ${dbJsPath}.`);
        process.exit(1);
    }
    
    const content = fs.readFileSync(dbJsPath, 'utf8');
    
    // Locate the boundaries of the JSON array inside database.js
    const jsonStartIdx = content.indexOf('[');
    const jsonEndIdx = content.lastIndexOf(']') + 1;
    
    if (jsonStartIdx === -1 || jsonEndIdx === 0) {
        console.error('Error: Could not locate JSON array inside database.js');
        process.exit(1);
    }
    
    const jsonStr = content.substring(jsonStartIdx, jsonEndIdx);
    const students = JSON.parse(jsonStr);
    
    console.log(`Parsed ${students.length} unique student profiles from seed file.`);
    
    // Bulk import
    await db.importAll(students);
    console.log('JSON database successfully seeded with Aditya University records!');
}

seed().catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
});
