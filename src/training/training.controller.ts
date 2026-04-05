import { Controller, Post, Body, Get, Param, Delete, Sse, MessageEvent } from '@nestjs/common';
import { Observable, fromEvent, map } from 'rxjs';
import { TrainingService } from './training.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Controller('training')
export class TrainingController {
  constructor(
    private trainingService: TrainingService,
    private eventEmitter: EventEmitter2,
  ) {} 

  @Post()
  create(@Body() createDto: CreateTrainingDto) {
    return this.trainingService.create(createDto); 
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.trainingService.findOne(id);
  }

  @Delete(':id')
  cancel(@Param('id') id: string) {
    return this.trainingService.cancel(id);
  }

  @Sse(':id/events')
  events(@Param('id') id: string): Observable<MessageEvent> {
    console.log(`[SSE Controller] Client subscribed to training ${id}`);
    return fromEvent(this.eventEmitter, `training.${id}`).pipe(
      map((payload: any) => {
        console.log(`[SSE Controller] Emitting event for ${id}:`, payload);
        return {
          data: JSON.stringify({ event: payload.event, data: payload.data }),
        } as MessageEvent;
      }),
    );
  }
}