import { Module } from '@nestjs/common';
import { TrainingService } from './training.service';
import { TrainingController } from './training.controller';
import { PrismaService } from '../prisma/prisma.service';
import { SimulatorService } from '../simulator/simulator.service';

@Module({
  controllers: [TrainingController],
  providers: [TrainingService, PrismaService, SimulatorService],
})
export class TrainingModule {}