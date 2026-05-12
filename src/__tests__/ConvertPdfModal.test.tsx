import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

jest.mock('../services/conversion');
jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock-docs/',
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
}));

import * as service from '../services/conversion';
import * as FileSystem from 'expo-file-system';
import { ConvertPdfModal } from '../components/ConvertPdfModal';
import { Book } from '../store/appStore';

const PDF_BOOK: Book = {
  id: 'b1',
  title: 'My Document.pdf',
  uri: '/local/My Document.pdf',
  type: 'pdf',
  groupId: null,
  lastPage: 0,
  totalPages: 0,
  addedAt: 1,
};

const mocked = service as jest.Mocked<typeof service>;

beforeEach(() => {
  jest.clearAllMocks();
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
});

it('walks through upload → convert → download → done and fires onDone', async () => {
  mocked.createConversion.mockResolvedValue({
    jobId: 'job-1',
    uploadUrl: 'https://gcs/upload',
  });
  mocked.uploadPdf.mockResolvedValue(undefined);
  mocked.startConversion.mockResolvedValue({
    jobId: 'job-1',
    status: 'done',
    downloadUrl: 'https://gcs/download',
    polishStatus: 'polished',
  });
  mocked.downloadEpub.mockResolvedValue(undefined);

  const onDone = jest.fn();
  const onClose = jest.fn();

  const screen = render(
    <ConvertPdfModal visible book={PDF_BOOK} onClose={onClose} onDone={onDone} />
  );

  await waitFor(() => {
    expect(mocked.createConversion).toHaveBeenCalledWith('My Document');
  });
  await waitFor(() => {
    expect(mocked.uploadPdf).toHaveBeenCalledWith(
      'https://gcs/upload',
      '/local/My Document.pdf'
    );
  });
  await waitFor(() => {
    expect(mocked.startConversion).toHaveBeenCalledWith('job-1');
  });
  await waitFor(() => {
    expect(mocked.downloadEpub).toHaveBeenCalledWith(
      'https://gcs/download',
      '/mock-docs/books/My Document.epub'
    );
  });

  await waitFor(() => {
    expect(onDone).toHaveBeenCalledWith({
      uri: '/mock-docs/books/My Document.epub',
      title: 'My Document.epub',
    });
  });

  expect(screen.getByText(/EPUB wurde zur Bibliothek/)).toBeTruthy();
});

it('shows the partial-polish notice when polish_status is polished_partial', async () => {
  mocked.createConversion.mockResolvedValue({ jobId: 'j', uploadUrl: 'u' });
  mocked.uploadPdf.mockResolvedValue(undefined);
  mocked.startConversion.mockResolvedValue({
    jobId: 'j',
    status: 'done',
    downloadUrl: 'd',
    polishStatus: 'polished_partial',
  });
  mocked.downloadEpub.mockResolvedValue(undefined);

  const screen = render(
    <ConvertPdfModal visible book={PDF_BOOK} onClose={jest.fn()} onDone={jest.fn()} />
  );

  await waitFor(() => {
    expect(screen.getByText(/nur der Anfang wurde KI-poliert/)).toBeTruthy();
  });
});

it('surfaces start failure as an error message', async () => {
  mocked.createConversion.mockResolvedValue({ jobId: 'j', uploadUrl: 'u' });
  mocked.uploadPdf.mockResolvedValue(undefined);
  mocked.startConversion.mockRejectedValue(new Error('start failed: 502 worker exploded'));

  const screen = render(
    <ConvertPdfModal visible book={PDF_BOOK} onClose={jest.fn()} onDone={jest.fn()} />
  );

  await waitFor(() => {
    expect(screen.getByText(/start failed: 502 worker exploded/)).toBeTruthy();
  });
});

it('retries the conversion after an error', async () => {
  mocked.createConversion
    .mockResolvedValueOnce({ jobId: 'j1', uploadUrl: 'u1' })
    .mockResolvedValueOnce({ jobId: 'j2', uploadUrl: 'u2' });
  mocked.uploadPdf.mockResolvedValue(undefined);
  mocked.startConversion
    .mockRejectedValueOnce(new Error('temporary failure'))
    .mockResolvedValueOnce({
      jobId: 'j2',
      status: 'done',
      downloadUrl: 'd2',
      polishStatus: 'polished',
    });
  mocked.downloadEpub.mockResolvedValue(undefined);

  const screen = render(
    <ConvertPdfModal visible book={PDF_BOOK} onClose={jest.fn()} onDone={jest.fn()} />
  );

  await waitFor(() => {
    expect(screen.getByText(/temporary failure/)).toBeTruthy();
  });

  fireEvent.press(screen.getByText('Erneut versuchen'));

  await waitFor(() => {
    expect(mocked.createConversion).toHaveBeenCalledTimes(2);
  });
  await waitFor(() => {
    expect(mocked.startConversion).toHaveBeenCalledTimes(2);
  });
  await waitFor(() => {
    expect(screen.getByText(/EPUB wurde zur Bibliothek/)).toBeTruthy();
  });
});

it('strips .pdf from title before sending to backend', async () => {
  mocked.createConversion.mockResolvedValue({ jobId: 'j', uploadUrl: 'u' });
  mocked.uploadPdf.mockResolvedValue(undefined);
  mocked.startConversion.mockResolvedValue({
    jobId: 'j',
    status: 'done',
    downloadUrl: 'd',
  });
  mocked.downloadEpub.mockResolvedValue(undefined);

  render(
    <ConvertPdfModal
      visible
      book={{ ...PDF_BOOK, title: 'Some Big Book.PDF' }}
      onClose={jest.fn()}
      onDone={jest.fn()}
    />
  );

  await waitFor(() => {
    expect(mocked.createConversion).toHaveBeenCalledWith('Some Big Book');
  });
});

it('uniquifies the EPUB filename when one already exists', async () => {
  mocked.createConversion.mockResolvedValue({ jobId: 'j', uploadUrl: 'u' });
  mocked.uploadPdf.mockResolvedValue(undefined);
  mocked.startConversion.mockResolvedValue({
    jobId: 'j',
    status: 'done',
    downloadUrl: 'd',
  });
  mocked.downloadEpub.mockResolvedValue(undefined);
  // First two probed paths already exist; third is free.
  (FileSystem.getInfoAsync as jest.Mock)
    .mockResolvedValueOnce({ exists: true })
    .mockResolvedValueOnce({ exists: true })
    .mockResolvedValueOnce({ exists: false });

  const onDone = jest.fn();
  render(
    <ConvertPdfModal visible book={PDF_BOOK} onClose={jest.fn()} onDone={onDone} />
  );

  await waitFor(() => {
    expect(mocked.downloadEpub).toHaveBeenCalledWith(
      'd',
      '/mock-docs/books/My Document (2).epub'
    );
  });
  expect(onDone).toHaveBeenCalledWith({
    uri: '/mock-docs/books/My Document (2).epub',
    title: 'My Document (2).epub',
  });
});

it('sanitizes filesystem-unsafe characters from the filename', async () => {
  mocked.createConversion.mockResolvedValue({ jobId: 'j', uploadUrl: 'u' });
  mocked.uploadPdf.mockResolvedValue(undefined);
  mocked.startConversion.mockResolvedValue({
    jobId: 'j',
    status: 'done',
    downloadUrl: 'd',
  });
  mocked.downloadEpub.mockResolvedValue(undefined);

  render(
    <ConvertPdfModal
      visible
      book={{ ...PDF_BOOK, title: 'Bad/Title:Here?.pdf' }}
      onClose={jest.fn()}
      onDone={jest.fn()}
    />
  );

  await waitFor(() => {
    expect(mocked.downloadEpub).toHaveBeenCalledWith(
      'd',
      '/mock-docs/books/Bad_Title_Here_.epub'
    );
  });
});
