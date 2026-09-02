const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const rootDir = path.join(__dirname, '..');
const backupDir = path.join(rootDir, '.dev_source_backup');

// ─── CONFIGURAÇÃO MILITAR DE OFUSCAÇÃO COM SELF-DEFENDING ───────────────────
const obfuscatorOptionsNode = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  numbersToExpressions: true,
  simplify: true,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.75,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayThreshold: 0.85,
  splitStrings: true,
  splitStringsChunkLength: 10,
  transformObjectKeys: false,
  selfDefending: true, // Se alguém alterar 1 byte ou formatar o código, ele trava e entra em loop
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
  if (!code || typeof code !== 'string') return false;
  const sample = code.slice(0, 1000);
  return (
    sample.includes('_0x') ||
    sample.startsWith('(function(') ||
    sample.startsWith('const _0x') ||
    sample.startsWith('var _0x') ||
    sample.startsWith('let _0x')
  );
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

    // Salva o backup apenas se o arquivo atual não estiver ofuscado
    if (!isAlreadyObfuscated(code)) {
      fs.writeFileSync(backupPath, code, 'utf8');
    }

    console.log(`🔒 Ofuscando e blindando: ${item.file}...`);
    const codeToObfuscate = (!isAlreadyObfuscated(code))
      ? code
      : (fs.existsSync(backupPath) ? fs.readFileSync(backupPath, 'utf8') : code);

    const obfuscated = JavaScriptObfuscator.obfuscate(codeToObfuscate, item.opts).getObfuscatedCode();
    fs.writeFileSync(srcPath, obfuscated, 'utf8');
  }
  console.log('✔️ [BLINDAGEM CONCLUÍDA] Código 100% blindado com Self-Defending contra engenharia reversa e portables!');
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
