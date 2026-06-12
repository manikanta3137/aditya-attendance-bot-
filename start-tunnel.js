const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Port should match what server.js uses
const PORT = process.env.PORT || 3000;

console.log('==================================================================');
console.log('🚀 Starting Aditya Attendance Bot Dev System...');
console.log('==================================================================\n');

// 1. Start Express Server
const serverPath = path.join(__dirname, 'server.js');
console.log(`[System] Launching Express Server (node server.js)...`);
const serverProcess = spawn('node', [serverPath], {
  stdio: 'inherit', // inherit lets QR codes and logs output directly to the console
  env: { ...process.env, PORT }
});

// 2. Start Cloudflare Tunnel
const cloudflaredPath = path.join(__dirname, 'cloudflared.exe');
console.log(`[System] Launching Cloudflare Tunnel (cloudflared.exe)...`);
const tunnelProcess = spawn(cloudflaredPath, ['tunnel', '--url', `http://localhost:${PORT}`]);

let urlFound = false;

// Helper to update README.md with the new URL
function updateReadme(newUrl) {
  try {
    const readmePath = path.join(__dirname, 'README.md');
    if (fs.existsSync(readmePath)) {
      let content = fs.readFileSync(readmePath, 'utf8');
      
      // Regex to match existing trycloudflare.com URL pattern
      const urlRegex = /https:\/\/[a-z0-9\-]+\.trycloudflare\.com/gi;
      
      if (urlRegex.test(content)) {
        content = content.replace(urlRegex, newUrl);
        fs.writeFileSync(readmePath, content, 'utf8');
        console.log(`[System] Successfully updated README.md with the new URL.`);
      } else {
        console.log(`[System] Warning: Could not find old Cloudflare URL pattern in README.md to replace.`);
      }
    }
  } catch (err) {
    console.error(`[System] Failed to update README.md:`, err.message);
  }
}

// Monitor tunnel output for the dynamic URL (typically printed to stderr)
const handleTunnelData = (data) => {
  const output = data.toString();
  
  // Try to find the trycloudflare url in the logs
  const match = output.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/i);
  if (match && !urlFound) {
    urlFound = true;
    const publicUrl = match[0];
    
    // Save to file
    fs.writeFileSync(path.join(__dirname, 'tunnel_url.txt'), publicUrl);
    
    // Print banner
    console.log('\n\n==================================================================');
    console.log('🎉 CLOUDFLARE TUNNEL CREATED SUCCESSFULLY!');
    console.log(`🔗 Public Link: ${publicUrl}`);
    console.log('==================================================================\n\n');
    
    // Update README.md
    updateReadme(publicUrl);
  }
  
  // Log tunnel messages to console with a prefix if they contain info/errors
  if (output.includes('ERR') || output.includes('Failed')) {
    console.error(`[Tunnel Error] ${output.trim()}`);
  } else if (!urlFound) {
    // Show tunnel startup progress before URL is resolved
    console.log(`[Tunnel Status] ${output.trim().split('\n')[0]}`);
  }
};

tunnelProcess.stdout.on('data', handleTunnelData);
tunnelProcess.stderr.on('data', handleTunnelData);

// 3. Graceful shutdown handler
const cleanup = () => {
  console.log('\n[System] Cleaning up processes...');
  try {
    serverProcess.kill();
  } catch (e) {}
  try {
    tunnelProcess.kill();
  } catch (e) {}
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

serverProcess.on('exit', (code) => {
  console.log(`[System] Express server exited with code ${code}`);
  cleanup();
});

tunnelProcess.on('exit', (code) => {
  console.log(`[System] Cloudflare tunnel exited with code ${code}`);
  cleanup();
});
