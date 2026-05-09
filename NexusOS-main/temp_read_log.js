import fs from 'fs';
const logPath = 'C:\\Users\\Mostafa\\AppData\\Roaming\\nexus-os\\logs\\nexus_os.log';
const stats = fs.statSync(logPath);
const chunkSize = 10000; // Read last 10KB
const start = Math.max(0, stats.size - chunkSize);
const stream = fs.createReadStream(logPath, { start, end: stats.size });
let data = '';
stream.on('data', chunk => data += chunk);
stream.on('end', () => console.log(data));
