import * as FileSystem from 'expo-file-system';
import { BACKEND_URL } from '../config/backend';

export type ConversionStatus =
  | 'awaiting_upload'
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'unknown';

export interface ConversionRecord {
  jobId: string;
  status: ConversionStatus;
  title?: string;
  downloadUrl?: string;
  error?: string;
  polishStatus?: string;
}

function parseRecord(data: any): ConversionRecord {
  return {
    jobId: data.job_id,
    status: data.status,
    title: data.title,
    downloadUrl: data.download_url,
    error: data.error,
    polishStatus: data.polish_status,
  };
}

export async function createConversion(
  title: string
): Promise<{ jobId: string; uploadUrl: string }> {
  const res = await fetch(`${BACKEND_URL}/conversions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`create conversion failed: ${res.status} ${detail}`);
  }
  const data = await res.json();
  return { jobId: data.job_id, uploadUrl: data.upload_url };
}

export async function uploadPdf(uploadUrl: string, pdfUri: string): Promise<void> {
  const result = await FileSystem.uploadAsync(uploadUrl, pdfUri, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });
  if (result.status >= 300) {
    throw new Error(`upload failed: HTTP ${result.status}`);
  }
}

// Hard cap the long-poll so a stuck connection can't hang the UI forever.
// The worker itself has a generous deadline; 30 min is well past any realistic
// conversion time.
const START_TIMEOUT_MS = 30 * 60 * 1000;

export async function startConversion(jobId: string): Promise<ConversionRecord> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), START_TIMEOUT_MS);
  try {
    const res = await fetch(`${BACKEND_URL}/conversions/${jobId}/start`, {
      method: 'POST',
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`start failed: ${res.status} ${detail}`);
    }
    return parseRecord(await res.json());
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getStatus(jobId: string): Promise<ConversionRecord> {
  const res = await fetch(`${BACKEND_URL}/conversions/${jobId}`);
  if (!res.ok) throw new Error(`status failed: ${res.status}`);
  return parseRecord(await res.json());
}

export async function downloadEpub(url: string, destUri: string): Promise<void> {
  const result = await FileSystem.downloadAsync(url, destUri);
  if (result.status >= 300) {
    throw new Error(`download failed: HTTP ${result.status}`);
  }
}
