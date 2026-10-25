import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma.module';
import { RecommendationWorkflow } from './recommendation-workflow';

/** Chưa mở HTTP tạo đề xuất khi Core chưa bàn giao read projection. */
@Module({ imports: [PrismaModule], providers: [RecommendationWorkflow], exports: [RecommendationWorkflow] })
export class AcquisitionModule {}
