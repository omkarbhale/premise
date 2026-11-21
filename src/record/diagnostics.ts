/** Why a change or a record was refused, said so that the proposer can fix it. */
export type RecordErrorCode = "MALFORMED" | "UNKNOWN_ITEM" | "CONFLICT" | "NOT_ALLOWED";

export interface Diagnostic {
  code: RecordErrorCode;
  /** The record file, when the problem is in one. */
  file?: string;
  /** 1-based line, when the problem is on one. */
  line?: number;
  message: string;
}

export function formatDiagnostic(d: Diagnostic): string {
  const where = d.file ? (d.line ? `${d.file} line ${d.line}: ` : `${d.file}: `) : "";
  return `${where}${d.message}`;
}

export function formatDiagnostics(list: Diagnostic[]): string {
  return list.map((d) => `- ${formatDiagnostic(d)}`).join("\n");
}
