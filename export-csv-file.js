const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'attendance.json');
const csvPath = path.join(__dirname, 'aditya_students_150.csv');

if (!fs.existsSync(dbPath)) {
    console.error('Error: attendance.json database file not found.');
    process.exit(1);
}

try {
    const students = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    if (students.length === 0) {
        console.error('Error: attendance.json is empty.');
        process.exit(1);
    }

    // Find all distinct subjects across the entire database
    const subjectsSet = new Set();
    students.forEach(s => {
        if (s.subjects) {
            Object.keys(s.subjects).forEach(sub => subjectsSet.add(sub));
        }
    });
    const subjectsArray = Array.from(subjectsSet);

    // Build header row
    let csvContent = 'RollNumber,Name,Branch,Phone';
    subjectsArray.forEach(sub => {
        const cleanSub = sub.replace(/,/g, '').replace(/_/g, ' ');
        csvContent += `,${cleanSub}_Attended,${cleanSub}_Conducted`;
    });
    csvContent += '\n';

    // Build data rows
    students.forEach(s => {
        const phone = s.phone || '';
        let row = `"${s.roll}","${s.name.replace(/"/g, '""')}","${s.branch}","${phone}"`;
        
        subjectsArray.forEach(sub => {
            if (s.subjects && s.subjects[sub]) {
                row += `,${s.subjects[sub].attended},${s.subjects[sub].conducted}`;
            } else {
                row += `,0,0`; // Default to 0 if subject not present for student
            }
        });
        csvContent += row + '\n';
    });

    // Write file
    fs.writeFileSync(csvPath, csvContent, 'utf8');
    console.log(`\n==================================================================`);
    console.log(`✅ CSV DATASET CREATED SUCCESSFULLY!`);
    console.log(`📂 Saved as: aditya_students_150.csv`);
    console.log(`📊 Total Student Records: ${students.length}`);
    console.log(`==================================================================\n`);

} catch (err) {
    console.error('Failed to export CSV:', err.message);
}
