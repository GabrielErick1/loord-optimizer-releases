const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
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
  console.log('🛡️ [BLINDAGEM MILITAR] Criando backup de desenvolvimento...');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 1. Backup do código-fonte limpo
  for (const item of filesToProtect) {
    const srcPath = path.join(rootDir, item.file);
    if (!fs.existsSync(srcPath)) continue;

    const backupPath = path.join(backupDir, path.basename(item.file));
    const code = fs.readFileSync(srcPath, 'utf8');

    if (!isAlreadyObfuscated(code)) {
      fs.writeFileSync(backupPath, code, 'utf8');
    }
  }

  // 2. Ofuscação avançada com JavaScriptObfuscator
  for (const item of filesToProtect) {
    const srcPath = path.join(rootDir, item.file);
    if (!fs.existsSync(srcPath)) continue;

    const backupPath = path.join(backupDir, path.basename(item.file));
    const code = fs.readFileSync(srcPath, 'utf8');

    console.log(`🔒 Ofuscando camada 1: ${item.file}...`);
    const codeToObfuscate = (!isAlreadyObfuscated(code))
      ? code
      : (fs.existsSync(backupPath) ? fs.readFileSync(backupPath, 'utf8') : code);

    const obfuscated = JavaScriptObfuscator.obfuscate(codeToObfuscate, item.opts).getObfuscatedCode();
    fs.writeFileSync(srcPath, obfuscated, 'utf8');
  }

  // 3. Compilação em V8 Bytecode Binário (.jsc via Bytenode sob o motor Electron)
  console.log('⚡ [V8 BYTECODE] Compilando arquivos principais em Bytecode Binário V8...');
  try {
    execSync('npx electron scripts/compile-bytecode.js', {
      cwd: rootDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'inherit'
    });
  } catch (err) {
    console.error('❌ Erro na compilação em bytecode:', err.message);
    process.exit(1);
  }

  // 4. Injeção dos Loaders Seguros nos arquivos .js de entrada
  console.log('🧩 [LOADERS] Injetando carregadores mínimos binários em main.js e preload.js...');
  const mainLoader = [
    "'use strict';",
    "const bytenode = require('bytenode');",
    "const path = require('path');",
    "require(path.join(__dirname, 'main.jsc'));"
  ].join('\n');
  fs.writeFileSync(path.join(rootDir, 'main.js'), mainLoader, 'utf8');

  const preloadLoader = [
    "'use strict';",
    "const bytenode = require('bytenode');",
    "const path = require('path');",
    "require(path.join(__dirname, 'preload.jsc'));"
  ].join('\n');
  fs.writeFileSync(path.join(rootDir, 'preload.js'), preloadLoader, 'utf8');

  console.log('✔️ [BLINDAGEM TOTAL CONCLUÍDA] V8 Bytecode + Self-Defending ativos! Impossível ler com IA ou descompilar!');
} else if (action === 'restore') {
  console.log('🔄 [RESTAURAÇÃO] Restaurando código original para desenvolvimento...');

  // Remove arquivos binários .jsc temporários de build
  const jscFiles = ['main.jsc', 'preload.jsc'];
  for (const jsc of jscFiles) {
    const jscPath = path.join(rootDir, jsc);
    if (fs.existsSync(jscPath)) {
      fs.unlinkSync(jscPath);
      console.log(`🗑️ Removido artefato binário: ${jsc}`);
    }
  }

  // Restaura código limpo dos fontes originais
  for (const item of filesToProtect) {
    const backupPath = path.join(backupDir, path.basename(item.file));
    const srcPath = path.join(rootDir, item.file);
    if (fs.existsSync(backupPath)) {
      const origCode = fs.readFileSync(backupPath, 'utf8');
      fs.writeFileSync(srcPath, origCode, 'utf8');
      console.log(`✔️ Restaurado com sucesso: ${item.file}`);
    }
  }
}
