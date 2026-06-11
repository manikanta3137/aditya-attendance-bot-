const localtunnel = require('localtunnel');
const fs = require('fs');

(async () => {
  try {
    console.log('Starting localtunnel on port 3000...');
    const tunnel = await localtunnel({ port: 3000 });
    console.log('==================================================================');
    console.log('🚀 YOUR PUBLIC DASHBOARD URL: ' + tunnel.url);
    console.log('==================================================================');
    
    fs.writeFileSync('tunnel_url.txt', tunnel.url);
    
    tunnel.on('close', () => {
      console.log('Tunnel closed');
    });
  } catch (err) {
    console.error('Error starting tunnel:', err.message);
  }
})();
