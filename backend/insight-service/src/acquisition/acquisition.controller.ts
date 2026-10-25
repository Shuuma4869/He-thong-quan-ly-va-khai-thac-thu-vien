import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req,
  UnauthorizedException, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AcquisitionGuard, acquisitionActor } from './acquisition.guard';
import { RecommendationWorkflow } from './recommendation-workflow';

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

@Controller('acquisition/recommendations')
@UseGuards(AcquisitionGuard)
export class AcquisitionController {
  constructor(private readonly workflow: RecommendationWorkflow) {}

  private actor(request: Request): string {
    const actor = (request as Request & { [acquisitionActor]?: string })[acquisitionActor];
    if (!actor) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');
    return actor;
  }

  @Get() @Header('Cache-Control', 'no-store')
  list(@Req() request: Request, @Query() query: RecommendationQuery) {
    this.actor(request);
    return this.workflow.list(query.page, query.size, query.state);
  }

  @Get(':id') @Header('Cache-Control', 'no-store')
  get(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    this.actor(request);
    return this.workflow.get(id);
  }

  @Post(':id/decision') @Header('Cache-Control', 'no-store')
  decide(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: DecisionRequest) {
    return this.workflow.decide(id, this.actor(request), body.action, body.reason, body.expectedVersion);
  }
}
