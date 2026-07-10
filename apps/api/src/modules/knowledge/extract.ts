import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { SourceType } from '@bw-ai-chat/shared';
import { badRequest } from '../../lib/errors.js';

/**
 * File → plain text at upload time. Only the extracted text is stored;
 * original binaries are not kept (PDF extraction is inherently lossy — noted
 * in the API docs; markdown/text is the high-fidelity path).
 */
export async function extractText(
  filename: string,
  buffer: Buffer,
): Promise<{ text: string; sourceType: SourceType }> {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'pdf': {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        return { text: result.text, sourceType: 'pdf' };
      } finally {
        await parser.destroy();
      }
    }
    case 'docx': {
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value, sourceType: 'docx' };
    }
    case 'md':
    case 'markdown':
      return { text: buffer.toString('utf8'), sourceType: 'markdown' };
    case 'txt':
      return { text: buffer.toString('utf8'), sourceType: 'text' };
    default:
      throw badRequest(
        'unsupported_file_type',
        `Unsupported file extension ".${ext}" — accepted: pdf, docx, md, txt.`,
      );
  }
}
