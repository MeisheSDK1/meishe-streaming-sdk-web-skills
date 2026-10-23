import {
  readApplicationProjectXml,
  writeApplicationProjectXml,
} from './application-project-xml';

export interface ProjectMediaRecord {
  id: string;
  path: string;
}

const ROOT = 'editorProject';
const SCHEMA_VERSION = '1';

export function writeProjectMediaIndex(filePath: string, records: ProjectMediaRecord[]): void {
  writeApplicationProjectXml(filePath, ROOT, SCHEMA_VERSION, (writer) => {
    writer.element('media', (media) => {
      for (const record of records) {
        if (!record.id || !record.path) throw new Error('Every media record needs an ID and path.');
        media.element('item', (item) => {
          item.attribute('id', record.id);
          item.attribute('path', record.path);
        });
      }
    });
  });
}

export function readProjectMediaIndex(filePath: string): ProjectMediaRecord[] {
  const records: ProjectMediaRecord[] = [];
  readApplicationProjectXml(filePath, {
    expectedRoot: ROOT,
    expectedSchemaVersion: SCHEMA_VERSION,
    onStartElement(element) {
      if (element.name !== 'item') return;
      const id = element.attribute('id');
      const path = element.attribute('path');
      if (!id || !path) throw new Error('Project media item is missing id/path.');
      records.push({ id, path });
    },
  });
  return records;
}
