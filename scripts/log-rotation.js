// Log rotation script to prevent disk space issues
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(path.join(__dirname, '..'));

const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 5;

function rotateLogFile(logPath) {
  try {
    if (!fs.existsSync(logPath)) return;
    
    const stats = fs.statSync(logPath);
    if (stats.size < MAX_LOG_SIZE) return;
    
    const logDir = path.dirname(logPath);
    const logName = path.basename(logPath, path.extname(logPath));
    const logExt = path.extname(logPath);
    
    // Rotate existing files
    for (let i = MAX_LOG_FILES - 1; i > 0; i--) {
      const oldFile = path.join(logDir, `${logName}.${i}${logExt}`);
      const newFile = path.join(logDir, `${logName}.${i + 1}${logExt}`);
      
      if (fs.existsSync(oldFile)) {
        if (i === MAX_LOG_FILES - 1) {
          // Delete the oldest file
          fs.unlinkSync(oldFile);
        } else {
          fs.renameSync(oldFile, newFile);
        }
      }
    }
    
    // Move current log to .1
    const rotatedFile = path.join(logDir, `${logName}.1${logExt}`);
    fs.renameSync(logPath, rotatedFile);
    
    console.log(`Log rotated: ${logPath} -> ${rotatedFile}`);
    
  } catch (error) {
    console.error(`Failed to rotate log ${logPath}:`, error.message);
  }
}

function rotateLogs() {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
      return;
    }
    
    const files = fs.readdirSync(LOGS_DIR);
    const logFiles = files.filter(file => 
      file.endsWith('.log') && !file.includes('.')
    );
    
    for (const file of logFiles) {
      const logPath = path.join(LOGS_DIR, file);
      rotateLogFile(logPath);
    }
    
    console.log(`Log rotation completed. Processed ${logFiles.length} files.`);
    
  } catch (error) {
    console.error('Log rotation failed:', error.message);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  rotateLogs();
}

export { rotateLogs };
