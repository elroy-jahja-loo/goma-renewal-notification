import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  onFile: (file: File) => void;
  uploading: boolean;
}

export default function FileDropZone({ onFile, uploading }: Props) {
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    setError('');
    if (rejected.length > 0) {
      const msg = rejected[0].errors?.[0]?.message || 'Invalid file';
      setError(msg);
      return;
    }
    if (accepted.length > 0) {
      const file = accepted[0];
      if (file.size > 10 * 1024 * 1024) {
        setError('File size exceeds 10MB limit');
        return;
      }
      setSelectedFile(file);
      onFile(file);
    }
  }, [onFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer',
          isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50',
          uploading && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
            <p className="mt-3 text-sm text-gray-600">Uploading and processing...</p>
          </>
        ) : selectedFile ? (
          <>
            <FileSpreadsheet className="h-10 w-10 text-indigo-500" />
            <p className="mt-3 text-sm font-medium text-gray-900">{selectedFile.name}</p>
            <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(0)} KB</p>
          </>
        ) : (
          <>
            <Upload className="h-10 w-10 text-gray-400" />
            <p className="mt-3 text-sm font-medium text-gray-900">
              {isDragActive ? 'Drop your file here' : 'Drag & drop your Excel/CSV file here'}
            </p>
            <p className="mt-1 text-xs text-gray-500">or click to browse (.xlsx, .xls, .csv up to 10MB)</p>
          </>
        )}
      </div>
      {error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}
