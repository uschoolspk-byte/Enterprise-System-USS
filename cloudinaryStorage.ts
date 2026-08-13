import { v2 as cloudinary } from 'cloudinary';

export const CLOUDINARY_BUCKET = 'cloudinary';

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

export function getCloudinaryConfig() {
  const cloud_name =
    readEnv('CLOUDINARY_CLOUD_NAME') ||
    readEnv('Product_Environment') ||
    readEnv('CLOUDINARY_CLOUDNAME');
  const api_key =
    readEnv('CLOUDINARY_API_KEY') ||
    readEnv('API_Key') ||
    readEnv('CLOUDINARY_KEY');
  const api_secret =
    readEnv('CLOUDINARY_API_SECRET') ||
    readEnv('CLOUDINARY_SECRET') ||
    readEnv('secret');
  const upload_preset =
    readEnv('CLOUDINARY_UPLOAD_PRESET') ||
    readEnv('Key_Name') ||
    readEnv('CLOUDINARY_PRESET');

  return { cloud_name, api_key, api_secret, upload_preset };
}

export function isCloudinaryConfigured(): boolean {
  const { cloud_name, api_key, api_secret, upload_preset } = getCloudinaryConfig();
  return Boolean(cloud_name && ((api_key && api_secret) || upload_preset));
}

export function isCloudinaryUrl(value: unknown): value is string {
  return typeof value === 'string' && /res\.cloudinary\.com/i.test(value);
}

export function configureCloudinary(): boolean {
  const cloudinaryUrl = readEnv('CLOUDINARY_URL');
  if (cloudinaryUrl) {
    cloudinary.config({ cloudinary_url: cloudinaryUrl, secure: true });
    return true;
  }

  const { cloud_name, api_key, api_secret } = getCloudinaryConfig();
  if (!cloud_name || !api_key || !api_secret) return false;
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return true;
}

function folderAndPublicId(storagePath: string): { folder: string; publicId: string; resourceType: 'image' | 'raw' } {
  const normalized = storagePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const lastSlash = normalized.lastIndexOf('/');
  const fileName = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash) : 'misc';
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase() : '';
  const baseName = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
  const resourceType = ext === 'pdf' || ext === 'bin' ? 'raw' : 'image';

  return {
    folder: `unique-school/${dir}`,
    publicId: baseName,
    resourceType
  };
}

async function uploadUnsignedToCloudinary(
  buffer: Buffer,
  storagePath: string,
  contentType: string
): Promise<{ ok: boolean; secureUrl?: string; publicId?: string; error?: string }> {
  const { cloud_name, upload_preset } = getCloudinaryConfig();
  if (!cloud_name || !upload_preset) {
    return { ok: false, error: 'Cloudinary upload preset is not configured.' };
  }

  cloudinary.config({ cloud_name, secure: true });

  const { folder, publicId, resourceType } = folderAndPublicId(storagePath);
  const isPdf =
    resourceType === 'raw' ||
    storagePath.toLowerCase().endsWith('.pdf') ||
    contentType.includes('pdf');
  const type = isPdf ? 'raw' : 'image';
  const mime = contentType || (isPdf ? 'application/pdf' : 'image/png');
  const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;

  try {
    const uniquePublicId = `${publicId}-${Date.now()}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      upload_preset,
      unsigned: true,
      folder,
      public_id: uniquePublicId,
      resource_type: type
    });

    return {
      ok: true,
      secureUrl: result.secure_url,
      publicId: result.public_id
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Cloudinary unsigned upload failed.'
    };
  }
}

async function uploadSignedToCloudinary(
  buffer: Buffer,
  storagePath: string,
  contentType: string
): Promise<{ ok: boolean; secureUrl?: string; publicId?: string; error?: string }> {
  if (!configureCloudinary()) {
    return { ok: false, error: 'Cloudinary signed credentials are not configured.' };
  }

  const { folder, publicId, resourceType } = folderAndPublicId(storagePath);
  const isPdf =
    resourceType === 'raw' ||
    storagePath.toLowerCase().endsWith('.pdf') ||
    contentType.includes('pdf');
  const type = isPdf ? 'raw' : 'image';
  const mime = contentType || (isPdf ? 'application/pdf' : 'image/jpeg');
  const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;

  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      public_id: publicId,
      resource_type: type,
      overwrite: true,
      type: 'upload'
    });

    return {
      ok: true,
      secureUrl: result.secure_url,
      publicId: result.public_id
    };
  } catch (err: unknown) {
    const cloudErr = err as { message?: string; http_code?: number };
    const message = cloudErr.message || 'Cloudinary signed upload failed.';
    return { ok: false, error: message };
  }
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  storagePath: string,
  contentType: string
): Promise<{ ok: boolean; secureUrl?: string; publicId?: string; error?: string }> {
  const { upload_preset, api_key, api_secret } = getCloudinaryConfig();

  if (upload_preset) {
    const unsigned = await uploadUnsignedToCloudinary(buffer, storagePath, contentType);
    if (unsigned.ok) return unsigned;
  }

  if (api_key && api_secret) {
    return uploadSignedToCloudinary(buffer, storagePath, contentType);
  }

  return { ok: false, error: 'Cloudinary is not configured.' };
}

export function buildCloudinaryDeliveryUrl(publicId: string, resourceType: 'image' | 'raw' = 'image'): string | null {
  const { cloud_name } = getCloudinaryConfig();
  if (!cloud_name || !publicId) return null;

  if (configureCloudinary()) {
    try {
      return cloudinary.url(publicId, {
        secure: true,
        resource_type: resourceType
      });
    } catch {
      // fall through
    }
  }

  const type = resourceType === 'raw' ? 'raw/upload' : 'image/upload';
  return `https://res.cloudinary.com/${cloud_name}/${type}/${publicId}`;
}
