import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma.module';
import { RecommendationWorkflow } from './recommendation-workflow';
import { AcquisitionController } from './acquisition.controller';
import { AcquisitionGuard } from './acquisition.guard';

/** Chỉ mở xem và quyết định; tạo đề xuất chờ nguồn Core được bảo vệ. */
@Module({ imports: [PrismaModule], controllers: [AcquisitionController],
  providers: [RecommendationWorkflow, AcquisitionGuard], exports: [RecommendationWorkflow] })
export class AcquisitionModule {}
