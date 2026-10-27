import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma.module';
import { RecommendationWorkflow } from './recommendation-workflow';
import { AcquisitionController } from './acquisition.controller';
import { AcquisitionGuard } from './acquisition.guard';
import { CoreAcquisitionFactsAdapter } from './core-acquisition-facts.adapter';

/** Chỉ mở xem và quyết định; tạo đề xuất chờ nguồn Core được bảo vệ. */
@Module({ imports: [PrismaModule], controllers: [AcquisitionController],
  providers: [RecommendationWorkflow, AcquisitionGuard, CoreAcquisitionFactsAdapter], exports: [RecommendationWorkflow] })
export class AcquisitionModule {}
