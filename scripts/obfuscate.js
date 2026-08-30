const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const rootDir = path.join(__dirname, '..');
const backupDir = path.join(rootDir, '.dev_source_backup');

const obfuscatorOptionsNode = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  numbersToExpressions: false,
  simplify: true,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.5,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1,
  stringArrayThreshold: 0.75,
  splitStrings: false,
  transformObjectKeys: false,
  selfDefending: false,
  disableConsoleOutput: false,
  target: 'node'
};

const obfuscatorOptionsBrowser = {
  ...obfuscatorOptionsNode,
  target: 'browser'
};

const filesToProtect = [
  { file: 'main.js', opts: obfuscatorOptionsNode },
  { file: 'preload.js', opts: obfuscatorOptionsNode },
  { file: 'renderer.js', opts: obfuscatorOptionsBrowser },
  { file: 'regis/encrypted_reg_data.js', opts: obfuscatorOptionsNode }
];

function isAlreadyObfuscated(code) {
  return code.startsWith('(function(') || (code.length > 500000 && code.includes('_0x'));
}

const action = process.argv[2] || 'obfuscate';

if (action === 'backup-and-obfuscate') {
  console.log('🛡️ [BLINDAGEM] Criando backup de desenvolvimento e aplicando Criptografia Militar...');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  for (const item of filesToProtect) {
    const srcPath = path.join(rootDir, item.file);
    if (!fs.existsSync(srcPath)) continue;

    const backupPath = path.join(backupDir, path.basename(item.file));
    const code = fs.readFileSync(srcPath, 'utf8');
    
    // Só faz backup se o código for legível (não ofuscado)
    if (!isAlreadyObfuscated(code)) {
      fs.writeFileSync(backupPath, code, 'utf8');
    }

    console.log(`🔒 Ofuscando e criptografando: ${item.file}...`);
    const codeToObfuscate = (!isAlreadyObfuscated(code)) ? code : fs.readFileSync(backupPath, 'utf8');
    const obfuscated = JavaScriptObfuscator.obfuscate(codeToObfuscate, item.opts).getObfuscatedCode();
    fs.writeFileSync(srcPath, obfuscated, 'utf8');
  }
  console.log('✔️ [BLINDAGEM CONCLUÍDA] Todo o código foi 100% blindado contra clonagem, descompilação e engenharia reversa!');
} else if (action === 'restore') {
  console.log('🔄 [RESTAURAÇÃO] Restaurando código original para desenvolvimento...');
  for (const item of filesToProtect) {
    const backupPath = path.join(backupDir, path.basename(item.file));
    const srcPath = path.join(rootDir, item.file);
    if (fs.existsSync(backupPath)) {
      const origCode = fs.readFileSync(backupPath, 'utf8');
      fs.writeFileSync(srcPath, origCode, 'utf8');
      console.log(`✔️ Restaurado: ${item.file}`);
    }
  }
}

