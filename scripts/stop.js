require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const pidFile = path.join(root, '.server.pid');
const port = process.env.PORT || 3000;

function tryKill(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    return true;
  } catch {
    return false;
  }
}

function pidsOnPort(portNum) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${portNum}`, { encoding: 'utf8' });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
      return [...pids];
    }

    const out = execSync(`lsof -ti tcp:${portNum} -sTCP:LISTEN`, { encoding: 'utf8' });
    return out
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

let stopped = false;

if (fs.existsSync(pidFile)) {
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  if (pid && tryKill(pid)) {
    console.log(`Carmina Store detenido (PID ${pid}).`);
    stopped = true;
  }
  try {
    fs.unlinkSync(pidFile);
  } catch {
    /* ignore */
  }
}

if (!stopped) {
  const pids = pidsOnPort(port);
  if (!pids.length) {
    console.log(`No hay proceso escuchando en el puerto ${port}.`);
    process.exit(0);
  }
  for (const pid of pids) {
    if (tryKill(pid)) {
      console.log(`Carmina Store detenido (PID ${pid}, puerto ${port}).`);
      stopped = true;
    }
  }
}

if (!stopped) {
  console.error(`No se pudo detener el proceso en el puerto ${port}.`);
  process.exit(1);
}
