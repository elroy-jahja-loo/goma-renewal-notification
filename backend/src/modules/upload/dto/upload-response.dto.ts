export interface UploadResponse {
  batchId: string;
  filename: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errorReportUrl: string;
}
