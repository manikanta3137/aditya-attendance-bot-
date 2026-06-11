// INITIAL_STUDENT_DB is loaded from database.js
if (typeof INITIAL_STUDENT_DB === 'undefined') {
    window.INITIAL_STUDENT_DB = [];
}

// Initialize Database in LocalStorage
function initDB() {
    const existing = localStorage.getItem('student_database');
    if (!existing) {
        localStorage.setItem('student_database', JSON.stringify(INITIAL_STUDENT_DB));
    } else {
        try {
            const parsed = JSON.parse(existing);
            // Overwrite if it was the old demo database (starts with CSE-101)
            if (parsed.length > 0 && (parsed[0].roll === "CSE-101" || parsed.length <= 7)) {
                localStorage.setItem('student_database', JSON.stringify(INITIAL_STUDENT_DB));
            }
        } catch(e) {}
    }
}
initDB();

// Get database from localStorage
function getStudents() {
    return JSON.parse(localStorage.getItem('student_database')) || [];
}

// Save database to localStorage
function saveStudents(students) {
    localStorage.setItem('student_database', JSON.stringify(students));
    // Trigger sync callback if exists
    if (window.onDatabaseUpdated) {
        window.onDatabaseUpdated();
    }
}

// Calculate attendance statistics
function calculateAttendance(student) {
    let totalAttended = 0;
    let totalConducted = 0;
    const subjectList = [];

    for (let subName in student.subjects) {
        const sub = student.subjects[subName];
        totalAttended += parseInt(sub.attended) || 0;
        totalConducted += parseInt(sub.conducted) || 0;
        const pct = sub.conducted > 0 ? ((sub.attended / sub.conducted) * 100).toFixed(1) : "0.0";
        subjectList.push({
            name: subName,
            attended: sub.attended,
            conducted: sub.conducted,
            percentage: parseFloat(pct)
        });
    }

    const overallPercentage = totalConducted > 0 ? ((totalAttended / totalConducted) * 100).toFixed(1) : "0.0";
    const overallPctNum = parseFloat(overallPercentage);
    
    let advice = "";
    let classesToAttend = 0;
    let classesToSkip = 0;

    if (overallPctNum < 75.0) {
        // x = ceil(3T - 4A)
        classesToAttend = Math.max(0, Math.ceil(3 * totalConducted - 4 * totalAttended));
        advice = `⚠️ *Action Required:* You need to attend **${classesToAttend}** more consecutive classes to reach **75%** overall attendance. Currently at **${overallPercentage}%**.`;
    } else {
        // y = floor(4A / 3 - T)
        classesToSkip = Math.max(0, Math.floor((4 * totalAttended) / 3 - totalConducted));
        advice = `✅ *Good Standing:* You can miss up to **${classesToSkip}** classes consecutively and still maintain at least **75%** overall attendance. Currently at **${overallPercentage}%**.`;
    }

    return {
        totalAttended,
        totalConducted,
        overallPercentage,
        subjectList,
        advice,
        classesToAttend,
        classesToSkip
    };
}

/* ==========================================
   WHATSAPP CHATBOT ENGINE
   ========================================== */
const chatbotState = {
    step: "WELCOME", // WELCOME, BRANCH_SELECTED, RESULTS
    selectedBranch: "",
    lastRollNumber: ""
};

// Send message to simulator UI
function addChatMessage(sender, content, isInteractive = false, buttons = []) {
    const chatArea = document.getElementById("chatArea");
    if (!chatArea) return;

    // Remove typing indicator if any
    const typingIndicator = document.getElementById("typingIndicator");
    if (typingIndicator) {
        typingIndicator.remove();
    }

    const msgDiv = document.createElement("div");
    msgDiv.className = `wa-msg ${sender === 'user' ? 'outgoing' : 'incoming'}`;
    
    // Convert newlines to breaks, escape html except bold stars *text*
    let formattedContent = content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<strong>$1</strong>");

    msgDiv.innerHTML = `
        <div>${formattedContent}</div>
        <span class="wa-time">${getCurrentTime()} ${sender === 'user' ? '<span class="wa-tick">✓✓</span>' : ''}</span>
    `;

    chatArea.appendChild(msgDiv);

    // If there are quick reply buttons
    if (buttons && buttons.length > 0) {
        const repliesDiv = document.createElement("div");
        repliesDiv.className = "wa-quick-replies";
        buttons.forEach(btn => {
            const btnEl = document.createElement("button");
            btnEl.className = "wa-btn-reply";
            btnEl.textContent = btn.label;
            btnEl.onclick = () => handleUserTextInput(btn.value || btn.label);
            repliesDiv.appendChild(btnEl);
        });
        chatArea.appendChild(repliesDiv);
    }

    // Scroll to bottom
    chatArea.scrollTop = chatArea.scrollHeight;
}

// Show typing indicator
function showTypingIndicator() {
    const chatArea = document.getElementById("chatArea");
    if (!chatArea || document.getElementById("typingIndicator")) return;

    const indDiv = document.createElement("div");
    indDiv.id = "typingIndicator";
    indDiv.className = "wa-msg incoming";
    indDiv.style.alignSelf = "flex-start";
    indDiv.style.borderTopLeftRadius = "0";
    indDiv.style.padding = "0.5rem 0.75rem";
    
    indDiv.innerHTML = `
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    
    chatArea.appendChild(indDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
}

// Get branches list dynamically
function getAvailableBranches() {
    const students = getStudents();
    const branches = new Set(students.map(s => s.branch.toUpperCase()));
    // fallback if empty
    if (branches.size === 0) return ["CSE", "ECE", "MECH", "CIVIL"];
    return Array.from(branches);
}

// Main logic router for chatbot responses
function chatbotResponse(userInput) {
    showTypingIndicator();
    
    setTimeout(() => {
        const inputClean = userInput.trim().toUpperCase();
        
        if (inputClean === "RESET" || inputClean === "START" || inputClean === "MENU" || inputClean === "HI" || inputClean === "HELLO") {
            resetChatbot();
            return;
        }

        switch (chatbotState.step) {
            case "WELCOME":
                // Expecting a branch select
                const branches = getAvailableBranches();
                if (branches.includes(inputClean)) {
                    chatbotState.selectedBranch = inputClean;
                    chatbotState.step = "BRANCH_SELECTED";
                    addChatMessage("bot", `Selected Branch: **${inputClean}**.\n\nPlease type your **Roll Number** to fetch your attendance report (e.g. ${inputClean}-101):`, false, [
                        { label: "Change Branch", value: "RESET" }
                    ]);
                } else {
                    addChatMessage("bot", "⚠️ Invalid branch selection. Please choose one of the options below or type your branch code directly:", false, 
                        branches.map(b => ({ label: b, value: b }))
                    );
                }
                break;

            case "BRANCH_SELECTED":
                // Expecting a roll number lookup
                const students = getStudents();
                const student = students.find(s => s.branch.toUpperCase() === chatbotState.selectedBranch && s.roll.toUpperCase() === inputClean);

                if (student) {
                    chatbotState.lastRollNumber = inputClean;
                    chatbotState.step = "RESULTS";
                    
                    const stats = calculateAttendance(student);
                    
                    let breakdownText = "";
                    stats.subjectList.forEach(sub => {
                        let statusIcon = sub.percentage >= 75 ? "🟢" : "🔴";
                        breakdownText += `\n${statusIcon} *${sub.name}:* ${sub.attended}/${sub.conducted} (${sub.percentage}%)`;
                    });

                    const report = `📋 *ATTENDANCE REPORT*
👤 *Name:* ${student.name}
🆔 *Roll No:* ${student.roll}
🎓 *Branch:* ${student.branch}
------------------------------
📚 *Subject Breakdown:*${breakdownText}
------------------------------
📊 *Overall:* ${stats.totalAttended}/${stats.totalConducted} conducted (**${stats.overallPercentage}%**)

${stats.advice}`;

                    addChatMessage("bot", report, false, [
                        { label: "Check Another Roll", value: "BACK_ROLL" },
                        { label: "Change Branch", value: "RESET" }
                    ]);
                } else {
                    addChatMessage("bot", `❌ Roll Number **${userInput}** not found in the **${chatbotState.selectedBranch}** branch database.\n\nPlease type your roll number again, or check your details.`, false, [
                        { label: "Change Branch", value: "RESET" }
                    ]);
                }
                break;

            case "RESULTS":
                if (userInput === "BACK_ROLL") {
                    chatbotState.step = "BRANCH_SELECTED";
                    addChatMessage("bot", `Please enter your **Roll Number** for branch **${chatbotState.selectedBranch}**:`, false, [
                        { label: "Change Branch", value: "RESET" }
                    ]);
                } else {
                    resetChatbot();
                }
                break;

            default:
                resetChatbot();
                break;
        }
    }, 800); // 800ms natural looking delay
}

// Reset chat status
function resetChatbot() {
    chatbotState.step = "WELCOME";
    chatbotState.selectedBranch = "";
    chatbotState.lastRollNumber = "";
    
    const branches = getAvailableBranches();
    const welcomeMsg = `👋 *Welcome to the College Attendance Chatbot!*

I can help you check your attendance records and calculate what you need to maintain a **75%** average.

Please select or type your *Branch* to start:`;
    
    addChatMessage("bot", welcomeMsg, false, branches.map(b => ({ label: b, value: b })));
}

// Format time
function getCurrentTime() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutes} ${ampm}`;
}

// Handle click/text events from input box or buttons
function handleUserTextInput(text) {
    if (!text || text.trim() === "") return;
    
    // Add user bubble
    addChatMessage("user", text);
    
    // Clear input field if matching input element
    const inputEl = document.getElementById("waInput");
    if (inputEl && inputEl.value === text) {
        inputEl.value = "";
    }
    
    // Route chatbot response
    chatbotResponse(text);
}


/* ==========================================
   FACULTY / HOD DASHBOARD LOGIC
   ========================================== */
let authenticated = false;
let currentEditIndex = -1; // -1 means adding new

function checkAuth() {
    return sessionStorage.getItem('faculty_authenticated') === 'true';
}

function handleLogin(e) {
    if(e) e.preventDefault();
    const user = document.getElementById("usernameInput").value.trim();
    const pass = document.getElementById("passwordInput").value.trim();

    if ((user === 'admin' && pass === 'admin123') || (user === 'faculty' && pass === 'faculty123')) {
        sessionStorage.setItem('faculty_authenticated', 'true');
        authenticated = true;
        showDashboardView();
        renderStudentTable();
    } else {
        alert("❌ Invalid credentials! Try admin / admin123 or faculty / faculty123");
    }
}

function handleLogout() {
    sessionStorage.removeItem('faculty_authenticated');
    authenticated = false;
    showDashboardView();
}

function showDashboardView() {
    const authOverlay = document.getElementById("authOverlay");
    const dashboardContent = document.getElementById("dashboardContent");
    const logoutBtn = document.getElementById("logoutBtn");

    if (checkAuth()) {
        authOverlay.style.display = "none";
        dashboardContent.style.display = "flex";
        logoutBtn.style.display = "block";
    } else {
        authOverlay.style.display = "flex";
        dashboardContent.style.display = "none";
        logoutBtn.style.display = "none";
    }
}

// Render student table with optional search/filter
function renderStudentTable(searchQuery = "") {
    const tbody = document.getElementById("studentTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";
    const students = getStudents();
    const query = searchQuery.trim().toLowerCase();

    students.forEach((student, index) => {
        if (query && !student.name.toLowerCase().includes(query) && !student.roll.toLowerCase().includes(query) && !student.branch.toLowerCase().includes(query)) {
            return;
        }

        const stats = calculateAttendance(student);
        const overallPct = stats.overallPercentage;
        
        let statusBadgeClass = "badge-success";
        if (stats.classesToAttend > 0) {
            statusBadgeClass = stats.classesToAttend > 10 ? "badge-danger" : "badge-warning";
        }

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${student.roll}</strong></td>
            <td>${student.name}</td>
            <td><span class="badge" style="background: rgba(139, 92, 246, 0.15); color: #c084fc;">${student.branch}</span></td>
            <td>${stats.totalAttended}/${stats.totalConducted}</td>
            <td><span class="badge ${statusBadgeClass}">${overallPct}%</span></td>
            <td>
                <button class="btn-edit" onclick="openEditModal(${index})"><i class="fas fa-edit"></i> Edit</button>
                <button class="btn-danger" onclick="deleteStudent(${index})"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Open modal for adding/editing student
function openAddModal() {
    currentEditIndex = -1;
    document.getElementById("modalTitle").innerText = "Add New Student Record";
    document.getElementById("studentRollInput").disabled = false;
    
    // Clear inputs
    document.getElementById("studentRollInput").value = "";
    document.getElementById("studentNameInput").value = "";
    document.getElementById("studentBranchInput").value = "CSE";
    
    // Reset subject inputs
    const subContainer = document.getElementById("subjectInputContainer");
    subContainer.innerHTML = "";
    
    // Render default subjects for a new student
    const defaultSubjects = ["Mathematics", "Physics", "Computer Science", "English"];
    defaultSubjects.forEach(sub => {
        subContainer.appendChild(createSubjectRowMarkup(sub, 0, 0));
    });

    document.getElementById("studentModal").style.display = "flex";
}

function openEditModal(index) {
    currentEditIndex = index;
    const student = getStudents()[index];
    if (!student) return;

    document.getElementById("modalTitle").innerText = `Edit: ${student.name} (${student.roll})`;
    document.getElementById("studentRollInput").value = student.roll;
    document.getElementById("studentRollInput").disabled = true; // Lock roll number
    document.getElementById("studentNameInput").value = student.name;
    document.getElementById("studentBranchInput").value = student.branch;

    const subContainer = document.getElementById("subjectInputContainer");
    subContainer.innerHTML = "";

    for (let subName in student.subjects) {
        const sub = student.subjects[subName];
        subContainer.appendChild(createSubjectRowMarkup(subName, sub.attended, sub.conducted));
    }

    document.getElementById("studentModal").style.display = "flex";
}

function createSubjectRowMarkup(name, attended, conducted) {
    const div = document.createElement("div");
    div.className = "subject-row-input";
    div.innerHTML = `
        <label class="sub-name-label">${name}</label>
        <input type="number" class="sub-attended" value="${attended}" min="0" placeholder="Attended" required>
        <input type="number" class="sub-conducted" value="${conducted}" min="0" placeholder="Conducted" required>
    `;
    return div;
}

function closeStudentModal() {
    document.getElementById("studentModal").style.display = "none";
}

// Add custom subject row
function addCustomSubjectRow() {
    const subName = prompt("Enter Subject Name:");
    if (!subName || subName.trim() === "") return;
    
    const container = document.getElementById("subjectInputContainer");
    container.appendChild(createSubjectRowMarkup(subName.trim(), 0, 0));
}

// Save student details
function saveStudentForm(e) {
    if (e) e.preventDefault();
    
    const roll = document.getElementById("studentRollInput").value.trim().toUpperCase();
    const name = document.getElementById("studentNameInput").value.trim();
    const branch = document.getElementById("studentBranchInput").value;
    
    if (!roll || !name) {
        alert("Roll Number and Name are required!");
        return;
    }

    const students = getStudents();
    
    // Assemble subjects
    const subjects = {};
    const rows = document.querySelectorAll("#subjectInputContainer .subject-row-input");
    
    let valid = true;
    rows.forEach(row => {
        const subName = row.querySelector(".sub-name-label").innerText;
        const attended = parseInt(row.querySelector(".sub-attended").value) || 0;
        const conducted = parseInt(row.querySelector(".sub-conducted").value) || 0;
        
        if (attended > conducted) {
            alert(`Subject "${subName}": Attended classes (${attended}) cannot exceed Conducted classes (${conducted})!`);
            valid = false;
        }
        subjects[subName] = { attended, conducted };
    });

    if (!valid) return;

    if (currentEditIndex === -1) {
        // Checking for duplicate roll numbers
        const exists = students.some(s => s.roll.toUpperCase() === roll);
        if (exists) {
            alert(`❌ Student with Roll Number ${roll} already exists!`);
            return;
        }
        students.push({ roll, name, branch, subjects });
    } else {
        // Editing existing
        students[currentEditIndex].name = name;
        students[currentEditIndex].branch = branch;
        students[currentEditIndex].subjects = subjects;
    }

    saveStudents(students);
    closeStudentModal();
    renderStudentTable();
}

function deleteStudent(index) {
    const students = getStudents();
    const student = students[index];
    if (!student) return;

    if (confirm(`Are you sure you want to delete the record of ${student.name} (${student.roll})?`)) {
        students.splice(index, 1);
        saveStudents(students);
        renderStudentTable();
    }
}

/* ==========================================
   CSV IMPORT/EXPORT UTILITY
   ========================================== */
function generateCSVString() {
    const students = getStudents();
    if (students.length === 0) return "";

    // Find all distinct subjects across database
    const subjectsSet = new Set();
    students.forEach(s => {
        Object.keys(s.subjects).forEach(sub => subjectsSet.add(sub));
    });
    const subjectsArray = Array.from(subjectsSet);

    // Build header
    // RollNumber, Name, Branch, Sub1_Attended, Sub1_Conducted, Sub2_Attended, Sub2_Conducted...
    let csv = "RollNumber,Name,Branch";
    subjectsArray.forEach(sub => {
        // Clean subject names for CSV header
        const cleanSub = sub.replace(/,/g, "");
        csv += `,${cleanSub}_Attended,${cleanSub}_Conducted`;
    });
    csv += "\n";

    // Build rows
    students.forEach(s => {
        let row = `"${s.roll}","${s.name.replace(/"/g, '""')}","${s.branch}"`;
        subjectsArray.forEach(sub => {
            const att = s.subjects[sub] ? s.subjects[sub].attended : 0;
            const cond = s.subjects[sub] ? s.subjects[sub].conducted : 0;
            row += `,${att},${cond}`;
        });
        csv += row + "\n";
    });

    return csv;
}

function exportCSV() {
    const csv = generateCSVString();
    const txtArea = document.getElementById("csvTextArea");
    if (txtArea) {
        txtArea.value = csv;
    }
}

function importCSV() {
    const txtArea = document.getElementById("csvTextArea");
    if (!txtArea || !txtArea.value.trim()) {
        alert("Please paste some CSV content first!");
        return;
    }

    try {
        const text = txtArea.value.trim();
        const lines = text.split("\n");
        if (lines.length < 2) {
            alert("CSV must contain at least a header row and one student data row!");
            return;
        }

        // Parse header
        const headers = parseCSVLine(lines[0]);
        if (headers.length < 5) {
            alert("CSV layout invalid. Required format: RollNumber,Name,Branch,Subject1_Attended,Subject1_Conducted,...");
            return;
        }

        // Identify subject indices
        const subjectIndices = []; // { name, attIdx, condIdx }
        for (let i = 3; i < headers.length; i += 2) {
            const attHeader = headers[i];
            const condHeader = headers[i+1];
            
            if (!attHeader || !condHeader) break;

            // Extract subject name (remove _Attended or _Conducted suffix)
            const subName = attHeader.replace(/_Attended/i, "").replace(/_/g, " ");
            subjectIndices.push({
                name: subName,
                attIdx: i,
                condIdx: i + 1
            });
        }

        const parsedStudents = [];

        for (let j = 1; j < lines.length; j++) {
            if (!lines[j].trim()) continue;
            const values = parseCSVLine(lines[j]);
            if (values.length < 3) continue;

            const roll = values[0].trim().toUpperCase();
            const name = values[1].trim();
            const branch = values[2].trim().toUpperCase();

            const subjects = {};
            subjectIndices.forEach(sub => {
                const attVal = parseInt(values[sub.attIdx]) || 0;
                const condVal = parseInt(values[sub.condIdx]) || 0;
                subjects[sub.name] = {
                    attended: attVal,
                    conducted: condVal
                };
            });

            parsedStudents.push({ roll, name, branch, subjects });
        }

        if (parsedStudents.length === 0) {
            alert("No valid students parsed from CSV.");
            return;
        }

        if (confirm(`Successfully parsed ${parsedStudents.length} students. Do you want to overwrite the current database? Click Cancel to append instead.`)) {
            saveStudents(parsedStudents);
        } else {
            // Append
            const current = getStudents();
            parsedStudents.forEach(newStud => {
                // If roll exists, overwrite; otherwise add
                const existIdx = current.findIndex(s => s.roll.toUpperCase() === newStud.roll);
                if (existIdx > -1) {
                    current[existIdx] = newStud;
                } else {
                    current.push(newStud);
                }
            });
            saveStudents(current);
        }

        renderStudentTable();
        alert("✅ Database successfully updated!");
    } catch (err) {
        alert(`❌ Error parsing CSV: ${err.message}`);
    }
}

// Simple CSV line parser that handles quotes
function parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}


/* ==========================================
   INITIALIZATION & TAB WIRING
   ========================================== */
window.onload = function() {
    // Sync updates to chatbot responses when HOD modifies database
    window.onDatabaseUpdated = function() {
        // Refresh chatbot state if student is edited
        if (chatbotState.step === "RESULTS" && chatbotState.lastRollNumber) {
            // Silently update results
            const students = getStudents();
            const student = students.find(s => s.roll.toUpperCase() === chatbotState.lastRollNumber);
            if (student) {
                // We could alert or update, lets keep chatbot state synced for their next check
            }
        }
        renderStudentTable();
    };

    // Dashboard tab buttons
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.remove("active"));
            
            tab.classList.add("active");
            const targetPane = document.getElementById(tab.dataset.tab);
            if (targetPane) targetPane.classList.add("active");

            if (tab.dataset.tab === "importExportTab") {
                exportCSV();
            }
        });
    });

    // Check query listener for student table
    const searchInput = document.getElementById("searchStudentInput");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            renderStudentTable(e.target.value);
        });
    }

    // Input message listener for chatbot
    const waInput = document.getElementById("waInput");
    const waSendBtn = document.getElementById("waSendBtn");

    if (waInput) {
        waInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                handleUserTextInput(waInput.value);
            }
        });
    }
    if (waSendBtn) {
        waSendBtn.addEventListener("click", () => {
            handleUserTextInput(waInput.value);
        });
    }

    // Auth screen check
    showDashboardView();

    // Start Chatbot welcome flow
    resetChatbot();
};
