// State variables
let currentEditRoll = ""; // If empty, we are adding a new student

// Helper to calculate overall percentage and advice classes
function calculateStats(student) {
    let totalAttended = 0;
    let totalConducted = 0;
    
    for (let subName in student.subjects) {
        const sub = student.subjects[subName];
        totalAttended += parseInt(sub.attended) || 0;
        totalConducted += parseInt(sub.conducted) || 0;
    }

    const pct = totalConducted > 0 ? ((totalAttended / totalConducted) * 100).toFixed(1) : "0.0";
    const pctNum = parseFloat(pct);
    
    let classesToAttend = 0;
    if (pctNum < 75.0) {
        classesToAttend = Math.max(0, Math.ceil(3 * totalConducted - 4 * totalAttended));
    }

    return {
        totalAttended,
        totalConducted,
        percentage: pct,
        classesToAttend
    };
}

// Check if user is logged in on load
async function checkAuth() {
    try {
        const res = await fetch('/api/me');
        const data = await res.json();
        
        const authOverlay = document.getElementById("authOverlay");
        const dashboardContent = document.getElementById("dashboardContent");
        const logoutBtn = document.getElementById("logoutBtn");
        const roleIndicator = document.getElementById("roleIndicator");
        const loggedInUser = document.getElementById("loggedInUser");

        if (data.authenticated) {
            authOverlay.style.display = "none";
            dashboardContent.style.display = "flex";
            logoutBtn.style.display = "block";
            roleIndicator.style.display = "block";
            loggedInUser.innerText = data.username.toUpperCase();
            loadStudentDatabase();
        } else {
            authOverlay.style.display = "flex";
            dashboardContent.style.display = "none";
            logoutBtn.style.display = "none";
            roleIndicator.style.display = "none";
        }
    } catch (err) {
        console.error('Error checking authentication status:', err);
    }
}

// Handle Login submit
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById("usernameInput").value.trim();
    const password = document.getElementById("passwordInput").value.trim();

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            checkAuth();
        } else {
            alert(`❌ Login Failed: ${data.error || 'Invalid credentials'}`);
        }
    } catch (err) {
        alert('❌ Error sending login request: ' + err.message);
    }
}

// Handle Logout
async function handleLogout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        checkAuth();
    } catch (err) {
        console.error('Error logging out:', err);
    }
}

// Fetch and render student records
async function loadStudentDatabase(query = "") {
    const tbody = document.getElementById("studentTableBody");
    if (!tbody) return;

    try {
        const url = query ? `/api/students?search=${encodeURIComponent(query)}` : '/api/students';
        const res = await fetch(url);
        if (!res.ok) {
            if (res.status === 401) return checkAuth();
            throw new Error('Failed to fetch records');
        }
        
        const students = await res.json();
        tbody.innerHTML = "";

        // Calculate and display live summary metrics
        const totalStudents = students.length;
        let sumPercentage = 0;
        let defaultersCount = 0;

        students.forEach(student => {
            const stats = calculateStats(student);
            const pctVal = parseFloat(stats.percentage) || 0;
            sumPercentage += pctVal;
            if (pctVal < 75.0) {
                defaultersCount++;
            }

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
                <td><span class="badge ${statusBadgeClass}">${stats.percentage}%</span></td>
                <td>
                    <button class="btn-primary" style="padding: 0.45rem 0.75rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem; margin-right: 0.3rem; background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.4); color: #4ade80;" onclick="sendWhatsAppAlert('${student.roll}')"><i class="fa-brands fa-whatsapp"></i> Alert</button>
                    <button class="btn-edit" onclick="openEditModal('${student.roll}')"><i class="fas fa-edit"></i> Edit</button>
                    <button class="btn-danger" onclick="deleteStudent('${student.roll}')"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Update summary metrics DOM elements
        const avgPercentage = totalStudents > 0 ? (sumPercentage / totalStudents).toFixed(1) : "0.0";
        const totalStudentsEl = document.getElementById("metricTotalStudents");
        const avgAttendanceEl = document.getElementById("metricAvgAttendance");
        const defaultersEl = document.getElementById("metricDefaulters");

        if (totalStudentsEl) totalStudentsEl.innerText = totalStudents;
        if (avgAttendanceEl) avgAttendanceEl.innerText = `${avgPercentage}%`;
        if (defaultersEl) defaultersEl.innerText = defaultersCount;

    } catch (err) {
        console.error('Error loading student table:', err.message);
    }
}

// Modals CRUD handlers
function openAddModal() {
    currentEditRoll = "";
    document.getElementById("modalTitle").innerText = "Add New Student Record";
    document.getElementById("studentRollInput").value = "";
    document.getElementById("studentRollInput").disabled = false;
    document.getElementById("studentNameInput").value = "";
    document.getElementById("studentPhoneInput").value = "";
    document.getElementById("studentBranchInput").value = "CSE";

    // Set default subject rows
    const container = document.getElementById("subjectInputContainer");
    container.innerHTML = "";
    const defaults = ["Python", "DBMS", "OS", "English"];
    defaults.forEach(sub => {
        container.appendChild(createSubjectRowMarkup(sub, 0, 0));
    });

    document.getElementById("studentModal").style.display = "flex";
}

async function openEditModal(roll) {
    try {
        const res = await fetch(`/api/students/${roll}`);
        if (!res.ok) throw new Error('Failed to load student details');
        
        const student = await res.json();
        
        currentEditRoll = student.roll;
        document.getElementById("modalTitle").innerText = `Edit Record: ${student.name}`;
        document.getElementById("studentRollInput").value = student.roll;
        document.getElementById("studentRollInput").disabled = true; // Lock roll number
        document.getElementById("studentNameInput").value = student.name;
        document.getElementById("studentPhoneInput").value = student.phone || "";
        document.getElementById("studentBranchInput").value = student.branch;

        const container = document.getElementById("subjectInputContainer");
        container.innerHTML = "";

        for (let subName in student.subjects) {
            const sub = student.subjects[subName];
            container.appendChild(createSubjectRowMarkup(subName, sub.attended, sub.conducted));
        }

        document.getElementById("studentModal").style.display = "flex";

    } catch (err) {
        alert('❌ Error fetching details: ' + err.message);
    }
}

function createSubjectRowMarkup(name, attended, conducted) {
    const div = document.createElement("div");
    div.className = "subject-row-input";
    div.innerHTML = `
        <label class="sub-name-label">${name}</label>
        <input type="number" class="sub-attended" value="${attended}" min="0" required>
        <input type="number" class="sub-conducted" value="${conducted}" min="0" required>
    `;
    return div;
}

function closeStudentModal() {
    document.getElementById("studentModal").style.display = "none";
}

function addCustomSubjectRow() {
    const name = prompt("Enter new subject name:");
    if (!name || !name.trim()) return;
    const container = document.getElementById("subjectInputContainer");
    container.appendChild(createSubjectRowMarkup(name.trim(), 0, 0));
}

// Save student record Form Submit
async function saveStudentForm(e) {
    e.preventDefault();
    const roll = document.getElementById("studentRollInput").value.trim().toUpperCase();
    const name = document.getElementById("studentNameInput").value.trim();
    const branch = document.getElementById("studentBranchInput").value;
    const phone = document.getElementById("studentPhoneInput").value.trim();

    if (!roll || !name) {
        alert("Roll Number and Name are required");
        return;
    }

    const subjects = {};
    const rows = document.querySelectorAll("#subjectInputContainer .subject-row-input");
    
    let valid = true;
    rows.forEach(row => {
        const subName = row.querySelector(".sub-name-label").innerText;
        const attended = parseInt(row.querySelector(".sub-attended").value) || 0;
        const conducted = parseInt(row.querySelector(".sub-conducted").value) || 0;
        
        if (attended > conducted) {
            alert(`Subject "${subName}": Attended classes (${attended}) cannot exceed conducted classes (${conducted})!`);
            valid = false;
        }
        subjects[subName] = { attended, conducted };
    });

    if (!valid) return;

    const payload = { roll, name, branch, phone, subjects };
    
    try {
        let url = '/api/students';
        let method = 'POST';

        if (currentEditRoll) {
            url = `/api/students/${currentEditRoll}`;
            method = 'PUT';
        }

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok) {
            closeStudentModal();
            loadStudentDatabase();
        } else {
            alert(`❌ Save Failed: ${data.error}`);
        }
    } catch (err) {
        alert('❌ Error saving student record: ' + err.message);
    }
}

// Delete student record
async function deleteStudent(roll) {
    if (!confirm(`Are you sure you want to permanently delete the attendance record for ${roll}?`)) {
        return;
    }

    try {
        const res = await fetch(`/api/students/${roll}`, { method: 'DELETE' });
        const data = await res.json();
        
        if (res.ok) {
            loadStudentDatabase();
        } else {
            alert(`❌ Delete Failed: ${data.error}`);
        }
    } catch (err) {
        alert('❌ Error deleting record: ' + err.message);
    }
}

// Trigger outbound WhatsApp alert via Direct WhatsApp Web Client
async function sendWhatsAppAlert(roll) {
    if (!confirm(`Do you want to send a WhatsApp attendance alert to student ${roll}?`)) {
        return;
    }

    try {
        const res = await fetch(`/api/students/${roll}/send-alert`, { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            if (data.simulated) {
                alert(`💬 [DEMO MODE]\n\n${data.message}`);
            } else {
                alert(`✅ Outbound WhatsApp alert triggered successfully!\n\nMessage ID: ${data.messageId}`);
            }
        } else {
            alert(`❌ Alert Failed: ${data.error}`);
        }
    } catch (err) {
        alert('❌ Error sending request: ' + err.message);
    }
}

// CSV Tab Functions
async function exportCSV() {
    try {
        const res = await fetch('/api/export-csv');
        if (!res.ok) throw new Error('Failed to generate CSV');
        const csvText = await res.text();
        document.getElementById("csvTextArea").value = csvText;
        
        // Reset file input and status display
        const fileInput = document.getElementById("csvFileInput");
        if (fileInput) fileInput.value = "";
        const fileStatus = document.getElementById("fileStatus");
        if (fileStatus) {
            fileStatus.innerText = "";
            fileStatus.style.display = "none";
        }
    } catch (err) {
        alert('❌ Export Error: ' + err.message);
    }
}

async function importCSV() {
    const csvText = document.getElementById("csvTextArea").value.trim();
    if (!csvText) {
        alert("Please paste or upload some CSV records first!");
        return;
    }

    if (!confirm("⚠️ WARNING: Importing this CSV will completely clear all existing database records and replace them. Continue?")) {
        return;
    }

    try {
        const res = await fetch('/api/import-csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csvText })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            alert("✅ Database successfully overwritten and seeded from CSV!");
            loadStudentDatabase();
            
            // Reset file input and status display
            const fileInput = document.getElementById("csvFileInput");
            if (fileInput) fileInput.value = "";
            const fileStatus = document.getElementById("fileStatus");
            if (fileStatus) {
                fileStatus.innerText = "";
                fileStatus.style.display = "none";
            }
        } else {
            alert(`❌ Import Failed: ${data.error}`);
        }
    } catch (err) {
        alert('❌ Import Request Error: ' + err.message);
    }
}

// Log out of WhatsApp from the dashboard
async function logoutWhatsApp() {
    if (!confirm("⚠️ WARNING: Are you sure you want to disconnect your WhatsApp account from the chatbot? This will shut down the bot until it is scanned again.")) {
        return;
    }
    
    try {
        const res = await fetch('/api/logout-whatsapp', { method: 'POST' });
        const data = await res.json();
        
        if (res.ok && data.success) {
            alert("✅ Disconnected from WhatsApp successfully! The local session has been cleared.");
            checkWhatsAppStatus();
        } else {
            alert(`❌ Disconnect Failed: ${data.error}`);
        }
    } catch (err) {
        alert("❌ Error sending disconnect request: " + err.message);
    }
}

// Toggle QR Setup Modal
function toggleQrModal() {
    const modal = document.getElementById("qrModal");
    if (!modal) return;
    
    if (modal.style.display === "flex") {
        modal.style.display = "none";
    } else {
        modal.style.display = "flex";
        checkWhatsAppStatus(); // Immediate check when opening
    }
}

// Check WhatsApp connection status
async function checkWhatsAppStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();

        const statusDot = document.getElementById("whatsappStatusDot");
        const statusText = document.getElementById("whatsappStatusText");
        
        const qrImg = document.getElementById("qrImg");
        const qrSpinner = document.getElementById("qrSpinner");
        const qrInstructions = document.getElementById("qrInstructions");
        const connectedAlert = document.getElementById("whatsappConnectedAlert");

        const metricWhatsappStatus = document.getElementById("metricWhatsappStatus");
        const whatsappMetricIcon = document.getElementById("whatsappMetricIcon");

        if (data.whatsappReady) {
            // Bot Connected
            if (statusDot) statusDot.style.background = "#10b981";
            if (statusText) statusText.innerText = "WhatsApp Linked";
            
            if (metricWhatsappStatus) metricWhatsappStatus.innerText = "Online";
            if (whatsappMetricIcon) {
                whatsappMetricIcon.classList.remove("red");
                whatsappMetricIcon.classList.add("green");
            }

            if (qrImg) qrImg.style.display = "none";
            if (qrSpinner) qrSpinner.style.display = "none";
            if (qrInstructions) qrInstructions.style.display = "none";
            if (connectedAlert) connectedAlert.style.display = "block";
        } else {
            // Bot Disconnected
            if (statusDot) statusDot.style.background = "#f43f5e";
            if (statusText) statusText.innerText = "Setup Bot";

            if (metricWhatsappStatus) metricWhatsappStatus.innerText = "Offline";
            if (whatsappMetricIcon) {
                whatsappMetricIcon.classList.remove("green");
                whatsappMetricIcon.classList.add("red");
            }
            
            if (connectedAlert) connectedAlert.style.display = "none";
            if (qrInstructions) qrInstructions.style.display = "block";

            if (data.qrAvailable) {
                // QR is ready on server, show it
                if (qrImg) {
                    qrImg.src = `/qr.png?t=${new Date().getTime()}`; // cache busting
                    qrImg.style.display = "block";
                }
                if (qrSpinner) qrSpinner.style.display = "none";
            } else {
                // QR is not ready (still loading browser)
                if (qrImg) qrImg.style.display = "none";
                if (qrSpinner) qrSpinner.style.display = "block";
            }
        }
    } catch (err) {
        console.error('Error checking WhatsApp status:', err);
    }
}

// Handle client-side CSV file upload selection
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
        alert('❌ Please select a valid CSV file (.csv)');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
        const text = evt.target.result;
        document.getElementById("csvTextArea").value = text;
        
        const fileStatus = document.getElementById("fileStatus");
        if (fileStatus) {
            fileStatus.innerText = `📄 Loaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            fileStatus.style.display = "inline";
        }
    };
    reader.onerror = function() {
        alert('❌ Failed to read CSV file.');
    };
    reader.readAsText(file);
}

// Initialize wiring
window.onload = function() {
    // Tab wiring
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

    // Search query listener
    const searchInput = document.getElementById("searchStudentInput");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            loadStudentDatabase(e.target.value);
        });
    }

    // Check auth status & WhatsApp status
    checkAuth();
    checkWhatsAppStatus();
    setInterval(checkWhatsAppStatus, 3000); // Poll status every 3 seconds
};
