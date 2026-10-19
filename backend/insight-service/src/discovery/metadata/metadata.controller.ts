import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
import { MetadataGuard } from './metadata.guard';
import { MetadataService } from './metadata.service';

@Controller('metadata')
@UseGuards(MetadataGuard)
export class MetadataController {
  constructor(private readonly metadata:MetadataService) {}
  @Get('books/:isbn13')
  @Header('Cache-Control','no-store')
  book(@Param('isbn13') isbn13:string) { return this.metadata.book(isbn13); }
  @Get('authors/:openLibraryId')
  @Header('Cache-Control','no-store')
  author(@Param('openLibraryId') id:string) { return this.metadata.author(id); }
}
