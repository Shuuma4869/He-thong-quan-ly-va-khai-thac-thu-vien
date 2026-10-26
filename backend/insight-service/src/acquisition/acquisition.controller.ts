import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req,
  UnauthorizedException, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AcquisitionGuard, acquisitionActor } from './acquisition.guard';
import { RecommendationWorkflow } from './recommendation-workflow';
import { CoreAcquisitionFactsAdapter } from './core-acquisition-facts.adapter';
import { scoreDemand } from './acquisition-score';
import { demandFactsFromSource, type AcquisitionScope } from './acquisition-source';

const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

class AcquisitionScopeRequest {
  @IsUUID() bookId!: string;
  @IsUUID() branchId!: string;
  @IsString() @Matches(utc) from!: string;
  @IsString() @Matches(utc) to!: string;
}

class RecommendationQuery {
  @Type(() => Number) @IsInt() @Min(0) @Max(1000000)
  page = 0;
  @Type(() => Number) @IsInt() @Min(1) @Max(50)
  size = 20;
  @IsOptional() @IsIn(['DRAFT', 'APPROVED', 'REJECTED'])
  state?: 'DRAFT' | 'APPROVED' | 'REJECTED';
}

class DecisionRequest {
  @IsIn(['APPROVED', 'REJECTED'])
  action!: 'APPROVED' | 'REJECTED';
  @IsString() @MinLength(10) @MaxLength(1000)
  reason!: string;
  @IsInt() @Min(0)
  expectedVersion!: number;
}

@Controller('acquisition')
@UseGuards(AcquisitionGuard)
export class AcquisitionController {
  constructor(private readonly workflow: RecommendationWorkflow,
    private readonly facts: CoreAcquisitionFactsAdapter) {}

  private actor(request: Request): string {
    const actor = (request as Request & { [acquisitionActor]?: string })[acquisitionActor];
    if (!actor) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');
    return actor;
  }

  @Get('analysis') @Header('Cache-Control', 'no-store')
  async analysis(@Req() request: Request, @Query() query: AcquisitionScopeRequest) {
    this.actor(request);
    const scope: AcquisitionScope = query;
    const snapshot = await this.facts.load(scope, request.headers.authorization!);
    return { snapshot, score: scoreDemand(demandFactsFromSource(scope, snapshot)) };
  }

  @Post('recommendations') @Header('Cache-Control', 'no-store')
  async create(@Req() request: Request, @Body() body: AcquisitionScopeRequest) {
    const scope: AcquisitionScope = body;
    const snapshot = await this.facts.load(scope, request.headers.authorization!);
    return this.workflow.createDraft(this.actor(request), scope, snapshot);
  }

  @Get('recommendations') @Header('Cache-Control', 'no-store')
  list(@Req() request: Request, @Query() query: RecommendationQuery) {
    this.actor(request);
    return this.workflow.list(query.page, query.size, query.state);
  }

  @Get('recommendations.csv')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="lams-acquisition.csv"')
  export(@Req() request: Request, @Query('state') state?: 'DRAFT' | 'APPROVED' | 'REJECTED') {
    this.actor(request);
    return this.workflow.exportCsv(state);
  }

  @Get('recommendations/:id') @Header('Cache-Control', 'no-store')
  get(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    this.actor(request);
    return this.workflow.get(id);
  }

  @Post('recommendations/:id/decision') @Header('Cache-Control', 'no-store')
  decide(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: DecisionRequest) {
    return this.workflow.decide(id, this.actor(request), body.action, body.reason, body.expectedVersion);
  }
}
