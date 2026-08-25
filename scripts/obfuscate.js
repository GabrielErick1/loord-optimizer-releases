const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.8,
  numbersToExpressions: true,
  simplify: true,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.8,
  stringArrayEncoding: ['base64', 'rc4'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.85,
  splitStrings: true,
  splitStringsChunkLength: 6,
  transformObjectKeys: true,
  target: 'browser'
};

console.log('🛡️ Iniciando Blindagem e Criptografia do Painel...');

// Obfuscate renderer.js for production release
const rendererPath = path.join(__dirname, '..', 'renderer.js');
const rendererCode = fs.readFileSync(rendererPath, 'utf8');
const obfRenderer = JavaScriptObfuscator.obfuscate(rendererCode, obfuscatorOptions).getObfuscatedCode();
fs.writeFileSync(path.join(__dirname, '..', 'renderer.obf.js'), obfRenderer, 'utf8');

console.log('✔️ Renderer blindado e ofuscado com sucesso!');
