const crypto = require('crypto');
const readline = require('readline');

const salt = 'FFOptimizerSecure2026';

function generateKeyForUuid(uuid) {
  const hash = crypto.createHash('sha256').update(uuid.trim().toLowerCase() + salt).digest('hex');
  const part1 = hash.substring(0, 4);
  const part2 = hash.substring(4, 8);
  const part3 = hash.substring(8, 12);
  const part4 = hash.substring(12, 16);
  return `${part1}-${part2}-${part3}-${part4}`.toUpperCase();
}

const args = process.argv.slice(2);
if (args.length > 0) {
  const uuid = args.join(' ');
  const key = generateKeyForUuid(uuid);
  console.log('\n=======================================');
  console.log(`UUID fornecido: ${uuid}`);
  console.log(`KEY gerada:     ${key}`);
  console.log('=======================================\n');
  process.exit(0);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n--- FFOptimizer Key Generator ---');
rl.question('Digite o UUID do cliente: ', (uuid) => {
  if (!uuid.trim()) {
    console.log('UUID inválido!');
    rl.close();
    process.exit(1);
  }
  const key = generateKeyForUuid(uuid);
  console.log('\n=======================================');
  console.log(`UUID: ${uuid.trim()}`);
  console.log(`KEY:  ${key}`);
  console.log('=======================================\n');
  rl.close();
});
