const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dp = [
  'select disk 1',
  'select partition 4',
  'set id=ebd0a0a2-b9e5-4433-87c0-68b6b72699c7',
  'format fs=ntfs quick label="LOORD_SETUP"',
  'assign letter=L',
  'exit'
].join('\r\n');

const dpPath = path.join(os.tmpdir(), 'format_part.txt');
fs.writeFileSync(dpPath, dp, 'utf8');

try {
  const out = execSync(`diskpart.exe /s "${dpPath}"`, { encoding: 'utf8' });
  console.log('Diskpart output:\n', out);
} catch (e) {
  console.error(e.stdout || e.message);
} finally {
  try { fs.unlinkSync(dpPath); } catch (_) {}
}
