import { assertSdkFsFilePath } from '../media/sdk-fs-paths';

export interface ApplicationProjectXmlWriter {
  attribute(name: string, value: string | number | boolean): void;
  textElement(name: string, text: string | number | boolean): void;
  element(name: string, writeBody?: (writer: ApplicationProjectXmlWriter) => void): void;
}

export interface ApplicationProjectXmlElement {
  name: string;
  attribute(name: string): string | undefined;
}

export interface ApplicationProjectXmlReadOptions {
  expectedRoot: string;
  expectedSchemaVersion: string;
  onStartElement(element: ApplicationProjectXmlElement): void;
  onEndElement?(name: string): void;
}

function requireWrite(success: boolean, operation: string): void {
  if (!success) throw new Error(`NvsXmlStreamWriter failed to ${operation}.`);
}

export function writeApplicationProjectXml(
  filePath: string,
  rootName: string,
  schemaVersion: string,
  writeBody: (writer: ApplicationProjectXmlWriter) => void,
  options: { doctype?: string } = {},
): void {
  if (!filePath || !rootName || !schemaVersion) {
    throw new Error('XML file path, root name, and schema version are required.');
  }
  assertSdkFsFilePath(filePath, ['project', 'projectresource']);
  const stream = new NvsXmlStreamWriter(filePath);
  if (!stream.open()) throw new Error(`Cannot open XML writer for ${filePath}.`);

  const writer: ApplicationProjectXmlWriter = {
    attribute(name, value) {
      requireWrite(stream.writeAttribute(name, String(value)), `write attribute ${name}`);
    },
    textElement(name, text) {
      requireWrite(stream.writeTextElement(name, String(text)), `write text element ${name}`);
    },
    element(name, body) {
      requireWrite(stream.writeStartElement(name), `start element ${name}`);
      body?.(writer);
      requireWrite(stream.writeEndElement(), `end element ${name}`);
    },
  };

  let operationError: unknown;
  try {
    requireWrite(stream.writeStartDocument(), 'start the document');
    if (options.doctype) requireWrite(stream.writeDTD(options.doctype), 'write the DTD');
    writer.element(rootName, (root) => {
      root.attribute('schemaVersion', schemaVersion);
      writeBody(root);
    });
    requireWrite(stream.writeEndDocument(), 'end the document');
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    if (!stream.close() && operationError === undefined) {
      throw new Error('NvsXmlStreamWriter failed to close.');
    }
  }
}

export function readApplicationProjectXml(
  filePath: string,
  options: ApplicationProjectXmlReadOptions,
): void {
  assertSdkFsFilePath(filePath, ['project', 'projectresource']);
  const stream = new NvsXmlStreamReader(filePath);
  if (!stream.open()) throw new Error(`Cannot open XML reader for ${filePath}.`);

  let rootSeen = false;
  let operationError: unknown;
  try {
    while (!stream.atEnd() && !stream.hasError()) {
      stream.readNext();
      if (stream.isEndElement()) {
        options.onEndElement?.(stream.name());
        continue;
      }
      if (!stream.isStartElement()) continue;

      const name = stream.name();
      const element: ApplicationProjectXmlElement = {
        name,
        attribute(attributeName) {
          const value = stream.getAttributeValue(attributeName);
          return value === undefined || value === null ? undefined : value;
        },
      };

      if (!rootSeen) {
        if (name !== options.expectedRoot) {
          throw new Error(`Unexpected XML root ${name}; expected ${options.expectedRoot}.`);
        }
        const version = element.attribute('schemaVersion');
        if (version !== options.expectedSchemaVersion) {
          throw new Error(
            `Unsupported project XML schema ${version ?? 'missing'}; expected ${options.expectedSchemaVersion}.`,
          );
        }
        rootSeen = true;
      }
      options.onStartElement(element);
    }
    if (stream.hasError()) throw new Error('NvsXmlStreamReader reported malformed XML.');
    if (!rootSeen) throw new Error('The project XML has no root element.');
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    if (!stream.close() && operationError === undefined) {
      throw new Error('NvsXmlStreamReader failed to close.');
    }
  }
}
