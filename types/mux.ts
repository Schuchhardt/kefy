export interface MuxUploadResult {
  uploadId:  string;
  uploadUrl: string;
}

export interface MuxAssetStatus {
  assetId:    string;
  playbackId: string | null;
  status:     'preparing' | 'ready' | 'errored';
}
