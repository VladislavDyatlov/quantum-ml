import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProjectsModule } from './projects/projects.module';
import { PrismaService } from './prisma/prisma.service';
import { CircuitsModule } from './circuits/circuits.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TrainingModule } from './training/training.module';

@Module({
  imports: [
    ProjectsModule,
     CircuitsModule,
     TrainingModule,
     EventEmitterModule.forRoot()
    ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
