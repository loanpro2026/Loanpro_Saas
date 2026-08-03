/** Public camera surfaces. Keep push authenticated. */
export function isPublicCameraRoute(pathname: string): boolean {
  return pathname === '/camera' || pathname.startsWith('/camera/') || pathname === '/api/camera'
}
