import { renderToBuffer } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

export async function toBuffer(doc: ReactElement): Promise<Buffer> {
  return renderToBuffer(doc);
}
