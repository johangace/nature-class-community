export interface CommunityExportManifest {
  schemaVersion: number;
  purpose?: string;
  includeRoots: string[];
  includeFiles: string[];
  excludeRoots: string[];
  excludeFiles: string[];
  policy?: string[];
  overlays?: Record<string, string>;
  denylist?: string;
}

export interface GitTreeEntry {
  mode: string;
  type: string;
  object: string;
  path: string;
}

export interface CommunityExportReceipt {
  schemaVersion: 1;
  sourceSha: string;
  manifest: string;
  fileCount: number;
  files: string[];
  overlays: Record<string, string>;
}

export interface OverlayEntry extends GitTreeEntry {
  source: string;
}

export interface DenylistRule {
  name: string;
  pattern: string;
  flags?: string;
  roots?: string[];
  skipRoots?: string[];
}

export const MANIFEST_PATH: string;
export const RECEIPT_FILE: string;

export function validateManifest(manifest: CommunityExportManifest): CommunityExportManifest;
export function shouldExport(path: string, manifest: CommunityExportManifest): boolean;
export function selectExportEntries(
  entries: GitTreeEntry[],
  manifest: CommunityExportManifest
): GitTreeEntry[];
export function resolveSourceSha(ref?: string, runner?: Function): string;
export function parseLsTree(buffer: Buffer | string): GitTreeEntry[];
export function listTree(sourceSha: string, runner?: Function): GitTreeEntry[];
export function selectOverlayEntries(
  entries: GitTreeEntry[],
  manifest: CommunityExportManifest
): OverlayEntry[];
export function findDenylistHits(
  files: { path: string; text: string }[],
  denylist: { rules: DenylistRule[] }
): { rule: string; path: string; line: number }[];
export function buildReceipt(args: {
  sourceSha: string;
  entries: GitTreeEntry[];
  overlays?: OverlayEntry[];
}): CommunityExportReceipt;
export function main(argv?: string[]): number;
