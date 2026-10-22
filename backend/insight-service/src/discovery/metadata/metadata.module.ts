import { Module } from '@nestjs/common';
import { MetadataController } from './metadata.controller';
import { MetadataGuard } from './metadata.guard';
import { MetadataService } from './metadata.service';
import { ProviderHttp } from './provider-http.service';
import { OpenLibraryProvider } from './open-library.service';
import { GoogleBooksProvider } from './google-books.service';
import { WikimediaProvider } from './wikimedia.service';
import { MediaNormalizer } from './media-normalizer.service';
import { PrismaService } from './history/prisma.service';
import { HistoryRepository } from './history/history.repository';
import { HistoryService } from './history/history.service';
import { HistoryController } from './history/history.controller';

@Module({controllers:[MetadataController,HistoryController],providers:[PrismaService,HistoryRepository,HistoryService,MetadataGuard,MetadataService,ProviderHttp,
  OpenLibraryProvider,GoogleBooksProvider,WikimediaProvider,MediaNormalizer]})
export class MetadataModule {}
