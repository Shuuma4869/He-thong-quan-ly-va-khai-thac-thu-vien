import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UnauthorizedException, UseGuards, ValidationPipe } from '@nestjs/common';
import type { Request } from 'express';
import { isUUID } from 'class-validator';
import { MetadataGuard, metadataActor } from '../metadata.guard';
import { HistoryService } from './history.service';
import { HistoryQuery, LookupRequest } from './history.dto';

const validation = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const uuid = new ParseUUIDPipe();

@Controller('metadata/history')
@UseGuards(MetadataGuard)
export class HistoryController {
  constructor(private readonly history: HistoryService) {}
  private owner(request: Request) {
    const id = (request as Request & { [metadataActor]?: string })[metadataActor];
    if (!id || !isUUID(id)) throw new UnauthorizedException('Định danh phiên đăng nhập không hợp lệ.');
    return id;
  }

  @Post() @Header('Cache-Control', 'no-store')
  lookup(@Req() request: Request, @Body(validation) body: LookupRequest) {
    return this.history.lookup(this.owner(request), body.isbn13);
  }

  @Get() @Header('Cache-Control', 'no-store')
  list(@Req() request: Request, @Query(validation) query: HistoryQuery) {
    return this.history.list(this.owner(request), query);
  }

  @Get(':id') @Header('Cache-Control', 'no-store')
  get(@Req() request: Request, @Param('id', uuid) id: string) {
    return this.history.get(this.owner(request), id);
  }

  @Post(':id/replay') @HttpCode(200) @Header('Cache-Control', 'no-store')
  replay(@Req() request: Request, @Param('id', uuid) id: string) {
    return this.history.replay(this.owner(request), id);
  }

  @Delete(':id') @HttpCode(204)
  remove(@Req() request: Request, @Param('id', uuid) id: string) {
    return this.history.remove(this.owner(request), id);
  }
}
