const http = require('http');

const PORT = 3000;
const WEBHOOK_PATH = '/webhook/whatsapp';
const SIMULATED_PHONE = 'whatsapp:+919876543210';

// Helper to make a POST request to the Twilio Webhook
function sendMessage(body) {
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams({
            From: SIMULATED_PHONE,
            Body: body
        }).toString();

        const options = {
            hostname: 'localhost',
            port: PORT,
            path: WEBHOOK_PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                // Parse Twilio TwiML Response
                const match = data.match(/<Message>([\s\S]*?)<\/Message>/);
                if (match && match[1]) {
                    // Unescape standard XML entities
                    let text = match[1]
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&amp;/g, '&')
                        .replace(/&quot;/g, '"')
                        .replace(/&apos;/g, "'");
                    resolve(text);
                } else {
                    resolve(data);
                }
            });
        });

        req.on('error', (err) => { reject(err); });
        req.write(postData);
        req.end();
    });
}

// Simulated Conversation Flow
async function runTestSimulation() {
    console.log('\n==================================================');
    console.log('      WHATSAPP CHATBOT CONVERSATION SIMULATOR     ');
    console.log('==================================================\n');

    try {
        // Step 1: Send greeting
        console.log(`📱 User [+91 98765 43210]: "Hi"`);
        let reply = await sendMessage('Hi');
        console.log(`🤖 Bot:\n----------\n${reply}\n----------\n`);

        // Step 2: Choose branch "CSE"
        console.log(`📱 User [+91 98765 43210]: "CSE"`);
        reply = await sendMessage('CSE');
        console.log(`🤖 Bot:\n----------\n${reply}\n----------\n`);

        // Step 3: Enter invalid roll number to test validation
        console.log(`📱 User [+91 98765 43210]: "23CSE999" (Invalid Roll)`);
        reply = await sendMessage('23CSE999');
        console.log(`🤖 Bot:\n----------\n${reply}\n----------\n`);

        // Step 4: Enter a valid student roll (e.g. 23CSE001)
        console.log(`📱 User [+91 98765 43210]: "23CSE001" (Valid Roll)`);
        reply = await sendMessage('23CSE001');
        console.log(`🤖 Bot:\n----------\n${reply}\n----------\n`);

        // Step 5: Send reset to search another
        console.log(`📱 User [+91 98765 43210]: "RESET"`);
        reply = await sendMessage('RESET');
        console.log(`🤖 Bot:\n----------\n${reply}\n----------\n`);

        console.log('==================================================');
        console.log('      SIMULATION COMPLETED SUCCESSFULLY           ');
        console.log('==================================================\n');

    } catch (err) {
        console.error('Simulation Failed: Check if your server is running on port 3000.');
        console.error(err.message);
    }
}

runTestSimulation();
