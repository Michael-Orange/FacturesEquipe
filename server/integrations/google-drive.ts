// Reference: google-drive blueprint
import { google } from 'googleapis';
import { Readable } from 'stream';
import sharp from 'sharp';

const ONE_MB = 1024 * 1024;
const MAX_WIDTH = 2000;
const JPEG_QUALITY = 85;

async function compressImageIfNeeded(file: Express.Multer.File): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const isImage = file.mimetype.startsWith('image/') && !file.mimetype.includes('gif');

  if (!isImage || file.buffer.length <= ONE_MB) {
    return { buffer: file.buffer, mimeType: file.mimetype, fileName: '' };
  }

  const compressed = await sharp(file.buffer)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return { buffer: compressed, mimeType: 'image/jpeg', fileName: '.jpg' };
}

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-drive',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Drive not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableGoogleDriveClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

export async function uploadFileToDrive(
  file: Express.Multer.File,
  folderId: string,
  fileName: string
): Promise<string> {
  const drive = await getUncachableGoogleDriveClient();

  const { buffer, mimeType, fileName: newExt } = await compressImageIfNeeded(file);

  let finalFileName = fileName;
  if (newExt) {
    if (/\.[^.]+$/.test(fileName)) {
      finalFileName = fileName.replace(/\.[^.]+$/, newExt);
    } else {
      finalFileName = fileName + newExt;
    }
  }

  const fileMetadata = {
    name: finalFileName,
    parents: [folderId],
  };

  const media = {
    mimeType,
    body: Readable.from(buffer),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id',
  });

  return response.data.id!;
}

export async function deleteFileFromDrive(fileId: string): Promise<void> {
  const drive = await getUncachableGoogleDriveClient();
  await drive.files.delete({ fileId });
}

export async function downloadFileFromDrive(fileId: string): Promise<Buffer> {
  const drive = await getUncachableGoogleDriveClient();
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(response.data as ArrayBuffer);
}

export async function createFolder(folderName: string, parentFolderId: string): Promise<string> {
  const drive = await getUncachableGoogleDriveClient();
  
  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentFolderId],
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
  });

  return response.data.id!;
}

export async function getOrCreateSubfolder(parentFolderId: string, folderName: string): Promise<string> {
  const drive = await getUncachableGoogleDriveClient();
  
  // Check if subfolder already exists
  const existingFolders = await drive.files.list({
    q: `'${parentFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  
  if (existingFolders.data.files && existingFolders.data.files.length > 0) {
    return existingFolders.data.files[0].id!;
  }
  
  // Create new subfolder
  return await createFolder(folderName, parentFolderId);
}

export async function listFilesInFolder(folderId: string): Promise<string[]> {
  const drive = await getUncachableGoogleDriveClient();
  
  const allFileIds: string[] = [];
  let nextPageToken: string | undefined = undefined;
  
  do {
    const listResponse = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
      fields: 'files(id), nextPageToken',
      pageSize: 100,
      pageToken: nextPageToken,
    });
    
    const fileIds = listResponse.data.files?.map((file: any) => file.id!) || [];
    allFileIds.push(...fileIds);
    
    nextPageToken = listResponse.data.nextPageToken || undefined;
  } while (nextPageToken);

  return allFileIds;
}

export async function moveFileToFolder(fileId: string, targetFolderId: string, currentParentId: string): Promise<void> {
  const drive = await getUncachableGoogleDriveClient();
  
  await drive.files.update({
    fileId: fileId,
    addParents: targetFolderId,
    removeParents: currentParentId,
    fields: 'id, parents',
  });
}

export async function archiveUserFiles(userFolderId: string): Promise<number> {
  const drive = await getUncachableGoogleDriveClient();
  
  // List files first - skip if no files to archive
  const fileIds = await listFilesInFolder(userFolderId);
  
  if (fileIds.length === 0) {
    return 0;
  }
  
  // Generate archive folder name
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const archiveFolderName = `archive_${year}${month}${day}`;
  
  // Check if archive folder already exists
  const existingFolders = await drive.files.list({
    q: `'${userFolderId}' in parents and name='${archiveFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  
  // Use existing folder or create new one
  const archiveFolderId = existingFolders.data.files?.[0]?.id || 
    await createFolder(archiveFolderName, userFolderId);
  
  // Move all files to archive
  for (const fileId of fileIds) {
    await moveFileToFolder(fileId, archiveFolderId, userFolderId);
  }
  
  return fileIds.length;
}
