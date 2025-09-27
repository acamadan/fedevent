# FEDEVENT Auto-run Instructions

This document explains how to automatically run the FEDEVENT application on your system.

## Quick Start

### Using npm scripts (Recommended)

```bash
# For development with auto-restart on file changes
npm run dev

# For production
npm start

# For auto-run with automatic restart on crashes (Linux/macOS)
npm run autorun

# For auto-run with automatic restart on crashes (Windows)
npm run autorun:windows
```

## Platform-specific Instructions

### Linux/macOS Systems

1. **Make scripts executable:**
   ```bash
   chmod +x start.sh
   chmod +x autorun.sh
   ```

2. **Run directly:**
   ```bash
   # One-time start
   ./start.sh
   
   # Auto-run with restart capability
   ./autorun.sh
   ```

3. **System-wide auto-start (Linux with systemd):**
   ```bash
   # Copy service file to systemd directory
   sudo cp fedevent.service /etc/systemd/system/
   
   # Reload systemd
   sudo systemctl daemon-reload
   
   # Enable the service
   sudo systemctl enable fedevent
   
   # Start the service
   sudo systemctl start fedevent
   
   # Check status
   sudo systemctl status fedevent
   ```

4. **System-wide auto-start (macOS with launchd):**
   ```bash
   # Copy plist file to LaunchAgents directory
   cp com.fedevent.plist ~/Library/LaunchAgents/
   
   # Load the service
   launchctl load ~/Library/LaunchAgents/com.fedevent.plist
   
   # Start the service
   launchctl start com.fedevent
   
   # Check status
   launchctl list | grep fedevent
   ```

### Windows Systems

1. **Run batch files:**
   ```cmd
   # One-time start
   start.bat
   
   # Auto-run with restart capability
   autorun.bat
   ```

2. **Windows Task Scheduler (for auto-start on boot):**
   - Open Task Scheduler
   - Create a new task
   - Set trigger to "At startup"
   - Set action to run `start.bat` from the project directory

## Environment Variables

Make sure to set up your environment variables in a `.env` file:

```env
# Database and server settings
PORT=3000
NODE_ENV=production

# Email settings (if needed)
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_USER=your-email@domain.com
SMTP_PASS=your-password
SMTP_FROM=noreply@fedevent.com

# Admin credentials
ADMIN_EMAIL=admin@fedevent.com
ADMIN_PASSWORD=admin123

# AWS settings (if needed)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

## Logs

Logs are stored in the `logs` directory:
- `output.log` - Standard output
- `error.log` - Error output

## Troubleshooting

1. **Port already in use:**
   - Change the PORT in your `.env` file
   - Or kill the process using the port: `lsof -i :3000` then `kill -9 PID`

2. **Permission denied:**
   - Make sure scripts are executable: `chmod +x *.sh`

3. **Node.js not found:**
   - Install Node.js from https://nodejs.org/

4. **Dependencies not installed:**
   - Run `npm install` in the project directory