import { uploadEntityDocumentViaApi } from '../../entityDocumentStorage';

/** Upload a drawer document/photo to the database and return the persisted view URL. */
export async function uploadDrawerDocument(
  entityType: 'students' | 'teachers',
  entityId: string,
  fieldKey: string,
  dataUrl: string,
  fileName?: string
): Promise<string> {
  const result = await uploadEntityDocumentViaApi(entityType, entityId, fieldKey, dataUrl, fileName);
  return result.url;
}
