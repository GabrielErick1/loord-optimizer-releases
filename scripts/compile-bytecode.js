const bytenode = require('bytenode');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

function compileToBytecode(filename) {
  const fullPath = path.join(rootDir, filename);
  const jscPath = path.join(rootDir, filename.replace(/\.js$/, '.jsc'));
  if (!fs.existsSync(fullPath)) {
    console.error(`Arquivo não encontrado: ${filename}`);
    return false;
  }

  console.log(`⚡ Compilando em V8 Bytecode: ${filename} -> ${path.basename(jscPath)}...`);
  bytenode.compileFile({
    filename: fullPath,
    output: jscPath,
    compileAsModule: true
  });

  const origSize = fs.statSync(fullPath).size;
  const jscSize = fs.statSync(jscPath).size;
  console.log(`✔️ [V8 BYTECODE OK] ${filename} (${origSize} bytes) -> ${path.basename(jscPath)} (${jscSize} bytes)`);
  return true;
}

const target = process.argv[2];
if (target) {
  compileToBytecode(target);
} else {
  compileToBytecode('main.js');
  compileToBytecode('preload.js');
}
