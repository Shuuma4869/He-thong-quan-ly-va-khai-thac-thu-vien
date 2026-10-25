import { Module } from '@nestjs/common';
import { PrismaService } from '../discovery/metadata/history/prisma.service';

@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
