const fs = require('fs');
const path = require('path');
const QRCode = require('../../frontend/node_modules/qrcode');

async function main() {
  const artifactDir = 'C:\\Users\\mutuk\\.gemini\\antigravity-ide\\brain\\4a7bf4a2-9d05-4073-8132-4b11de2cc9f7';
  const targetRecordId = '5f580007-0366-479a-b6bd-97f3802062f2';
  
  // Real verification URL
  const verificationUrl = `http://localhost:3000/?verifyRecordId=${encodeURIComponent(targetRecordId)}`;
  
  const artifactPath = path.join(artifactDir, 'scannable_health_passport_qr.png');
  const publicPath = path.join(__dirname, '../../frontend/public/scannable_health_passport_qr.png');
  
  await QRCode.toFile(artifactPath, verificationUrl, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });

  await QRCode.toFile(publicPath, verificationUrl, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });

  console.log('Scannable QR generated at:', artifactPath);
  console.log('Public copy generated at:', publicPath);
  console.log('Encoded URL:', verificationUrl);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
