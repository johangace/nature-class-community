export const PUBLIC_REMOTE: string;
export const HEALTH_URL: string;
export const RELEASE_AUTHOR: { name: string; email: string };
export function nextVersion(tags: string[]): string;
export function contributorsFromLog(logText: string): string[];
export function releaseMessage(args: { version: string; sourceSha: string; contributors: string[] }): string;
export function main(argv?: string[]): Promise<number>;
