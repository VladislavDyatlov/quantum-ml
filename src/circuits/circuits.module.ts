import { Module } from '@nestjs/common';
import { CircuitsService } from './circuits.service';
import { CircuitsController, CircuitDetailController } from './circuits.controller';
import { PrismaService } from '../prisma/prisma.service';
import { SimulatorService } from '../simulator/simulator.service';

@Module({
  controllers: [CircuitsController, CircuitDetailController],
  providers: [CircuitsService, PrismaService, SimulatorService],
  exports: [CircuitsService],
})
export class CircuitsModule {}