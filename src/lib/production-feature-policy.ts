type PublicRuntime = {
  env?: {
    MITA_ENV?: string;
    MITA_PUBLIC_SYNC_ENABLED?: string;
  };
};

export function shouldHidePublicAiChat(runtime: PublicRuntime | undefined): boolean {
  return runtime?.env?.MITA_ENV === 'production'
    && runtime.env.MITA_PUBLIC_SYNC_ENABLED === 'true';
}
