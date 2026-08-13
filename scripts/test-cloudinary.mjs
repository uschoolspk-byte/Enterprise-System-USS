import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';

const cloudName =
  process.env.CLOUDINARY_CLOUD_NAME?.trim() ||
  process.env.CLOUDINARY_URL?.match(/@([^/?]+)/)?.[1] ||
  '';

if (!cloudName) {
  console.error('Missing CLOUDINARY_CLOUD_NAME or CLOUDINARY_URL');
  process.exit(1);
}

cloudinary.config({ cloud_name: cloudName, secure: true });

console.log('cloud:', cloudName);
console.log('mode: unsigned (preset Unique)');

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const dataUri = `data:image/png;base64,${png.toString('base64')}`;

try {
  const result = await cloudinary.uploader.upload(dataUri, {
    upload_preset: 'Unique',
    unsigned: true,
    folder: 'unique-school/students/test',
    public_id: `gal-test-${Date.now()}`
  });

  console.log('upload:', JSON.stringify({
    ok: true,
    secureUrl: result.secure_url,
    publicId: result.public_id
  }, null, 2));
} catch (err) {
  console.error('upload:', JSON.stringify({
    ok: false,
    error: err?.message || String(err)
  }, null, 2));
  process.exit(1);
}
