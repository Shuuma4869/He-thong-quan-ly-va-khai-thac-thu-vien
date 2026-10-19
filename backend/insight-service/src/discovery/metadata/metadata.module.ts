import { Module } from '@nestjs/common';
import { MetadataController } from './metadata.controller';
import { MetadataGuard } from './metadata.guard';
import { MetadataService } from './metadata.service';
import { ProviderHttp } from './provider-http.service';
import { OpenLibraryProvider } from './open-library.service';
import { GoogleBooksProvider } from './google-books.service';
import { WikimediaProvider } from './wikimedia.service';
import { MediaNormalizer } from './media-normalizer.service';

@Module({controllers:[MetadataController],providers:[MetadataGuard,MetadataService,ProviderHttp,
  OpenLibraryProvider,GoogleBooksProvider,WikimediaProvider,MediaNormalizer]})
export class MetadataModule {}
