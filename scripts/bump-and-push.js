const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const versionPath = path.join(__dirname, '..', 'src', 'version.ts');
let content = fs.readFileSync(versionPath, 'utf8');

// APP_VERSION = '1.9' 형태에서 숫자 추출. 뒷자리가 두 자리가 되면 앞을 1 올림 (1.9 → 2.0, 2.9 → 3.0)
const match = content.match(/APP_VERSION\s*=\s*'(\d+)\.(\d+)'/);
if (!match) {
  console.error('version.ts 형식을 못 찾았어요. APP_VERSION = \'1.9\' 형태인지 확인하세요.');
  process.exit(1);
}
const majorNum = Number(match[1]);
const minorNum = Number(match[2]);
const nextMinor = minorNum + 1;
const newMajor = nextMinor >= 10 ? majorNum + 1 : majorNum;
const newMinor = nextMinor >= 10 ? 0 : nextMinor;
const newVersion = `${newMajor}.${newMinor}`;

content = content.replace(/APP_VERSION\s*=\s*'[\d.]+'/, `APP_VERSION = '${newVersion}'`);
fs.writeFileSync(versionPath, content);

console.log('버전 올림:', match[1] + '.' + match[2], '→', newVersion);
execSync(`git add . && git commit -m "자동 업데이트${newVersion}" && git push`, {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});
console.log('푸시까지 완료.');
