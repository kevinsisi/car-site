export function isPageAvailable(environment: string | undefined): boolean {
  return environment !== 'production';
}
