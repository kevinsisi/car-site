export interface VideoLinkView {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  sortOrder: number;
}

export async function listVideoLinks(): Promise<VideoLinkView[]> {
  return [];
}
