const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const versionPath = path.join(__dirname, '..', 'src', 'version.ts');
let content = fs.readFileSync(versionPath, 'utf8');

// APP_VERSION = '1.9' 형태에서 숫자 추출 후 마지막 자리만 1 올림 (1.9 → 1.10, 1.10 → 1.11)
const match = content.match(/APP_VERSION\s*=\s*'(\d+)\.(\d+)'/);
if (!match) {
  console.error('version.ts 형식을 못 찾았어요. APP_VERSION = \'1.9\' 형태인지 확인하세요.');
  process.exit(1);
}
const major = match[1];
const minor = String(Number(match[2]) + 1);
const newVersion = `${major}.${minor}`;

content = content.replace(/APP_VERSION\s*=\s*'[\d.]+'/, `APP_VERSION = '${newVersion}'`);
fs.writeFileSync(versionPath, content);

console.log('버전 올림:', match[1] + '.' + match[2], '→', newVersion);
execSync(`git add . && git commit -m "자동 업데이트${newVersion}" && git push`, {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});
console.log('푸시까지 완료.');
