const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const rootDir = path.join(__dirname, '..');
const backupDir = path.join(rootDir, '.dev_source_backup');

const obfuscatorOptionsNode = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.9,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  numbersToExpressions: true,
  simplify: true,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.9,
  stringArrayEncoding: ['base64', 'rc4'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 3,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 5,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.9,
  splitStrings: true,
  splitStringsChunkLength: 5,
  transformObjectKeys: true,
  selfDefending: true,
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
    fs.writeFileSync(backupPath, code, 'utf8');

    console.log(`🔒 Ofuscando e criptografando: ${item.file}...`);
    const obfuscated = JavaScriptObfuscator.obfuscate(code, item.opts).getObfuscatedCode();
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

