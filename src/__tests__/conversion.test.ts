import {
  createConversion,
  startConversion,
  getStatus,
  uploadPdf,
  downloadEpub,
} from '../services/conversion';

jest.mock('expo-file-system', () => ({
  uploadAsync: jest.fn(),
  downloadAsync: jest.fn(),
  FileSystemUploadType: { BINARY_CONTENT: 'BINARY_CONTENT' },
  documentDirectory: '/mock-docs/',
  makeDirectoryAsync: jest.fn(),
}));

import * as FileSystem from 'expo-file-system';

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

const jsonResponse = (status: number, body: any) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any);

beforeEach(() => {
  fetchMock.mockReset();
  (FileSystem.uploadAsync as jest.Mock).mockReset();
  (FileSystem.downloadAsync as jest.Mock).mockReset();
});

describe('createConversion', () => {
  it('posts title and parses job_id + upload_url', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        job_id: 'abc123',
        upload_url: 'https://gcs.test/upload/abc',
      })
    );

    const result = await createConversion('My Book');

    expect(result).toEqual({
      jobId: 'abc123',
      uploadUrl: 'https://gcs.test/upload/abc',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://backend.test/conversions');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ title: 'My Book' });
  });

  it('throws on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { detail: 'boom' }));
    await expect(createConversion('x')).rejects.toThrow(/create conversion failed/);
  });
});

describe('uploadPdf', () => {
  it('calls FileSystem.uploadAsync with PUT + application/pdf', async () => {
    (FileSystem.uploadAsync as jest.Mock).mockResolvedValueOnce({ status: 200 });

    await uploadPdf('https://gcs.test/upload/x', '/path/to/file.pdf');

    expect(FileSystem.uploadAsync).toHaveBeenCalledWith(
      'https://gcs.test/upload/x',
      '/path/to/file.pdf',
      expect.objectContaining({
        httpMethod: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        uploadType: 'BINARY_CONTENT',
      })
    );
  });

  it('throws when GCS returns 4xx', async () => {
    (FileSystem.uploadAsync as jest.Mock).mockResolvedValueOnce({ status: 403 });
    await expect(uploadPdf('u', 'f')).rejects.toThrow(/HTTP 403/);
  });
});

describe('startConversion', () => {
  it('parses download_url and status from backend response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        job_id: 'abc',
        status: 'done',
        download_url: 'https://gcs.test/download/abc.epub',
        polish_status: 'polished',
      })
    );

    const result = await startConversion('abc');

    expect(result.status).toBe('done');
    expect(result.downloadUrl).toBe('https://gcs.test/download/abc.epub');
    expect(result.polishStatus).toBe('polished');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://backend.test/conversions/abc/start');
  });

  it('throws on 502 with body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(502, { detail: 'worker exploded' }));
    await expect(startConversion('abc')).rejects.toThrow(/start failed: 502/);
  });

  it('passes an internal abort signal so the request can time out', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { job_id: 'x', status: 'done' })
    );
    await startConversion('abc');
    const [, init] = fetchMock.mock.calls[0];
    // Internal timeout uses an AbortController.signal — it should NOT have
    // aborted yet (request returned successfully).
    expect(init.signal).toBeDefined();
    expect(init.signal.aborted).toBe(false);
  });
});

describe('getStatus', () => {
  it('parses record', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        job_id: 'abc',
        status: 'running',
        title: 'Book',
      })
    );

    const result = await getStatus('abc');
    expect(result.status).toBe('running');
    expect(result.title).toBe('Book');
  });
});

describe('downloadEpub', () => {
  it('writes EPUB to dest via FileSystem.downloadAsync', async () => {
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValueOnce({ status: 200 });
    await downloadEpub('https://gcs.test/download/x', '/dest/x.epub');
    expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
      'https://gcs.test/download/x',
      '/dest/x.epub'
    );
  });

  it('throws on 404', async () => {
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValueOnce({ status: 404 });
    await expect(downloadEpub('u', 'd')).rejects.toThrow(/HTTP 404/);
  });
});
