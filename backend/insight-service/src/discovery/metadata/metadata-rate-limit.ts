import { SetMetadata } from '@nestjs/common';

export const metadataRateGroup = Symbol('metadataRateGroup');

// Chỉ gắn lên các handler không gọi provider. Route mới mặc định dùng quota provider.
export const HistoryCrudRateLimit = () => SetMetadata(metadataRateGroup, 'history');
