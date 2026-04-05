import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Put,
    Delete, 
    HttpCode,
    HttpStatus,
    Query,
  } from '@nestjs/common';
  import { CircuitsService } from './circuits.service';
  import { CreateCircuitDto } from './dto/create-circuit.dto';
  import { UpdateCircuitDto } from './dto/update-circuit.dto';
  import { SimulateCircuitDto } from './dto/simulate-circuit.dto';
  
  @Controller('projects/:projectId/circuits')
  export class CircuitsController {
    constructor(private readonly circuitsService: CircuitsService) {}
  
    @Post()
    create(@Param('projectId') projectId: string, @Body() createCircuitDto: CreateCircuitDto) {
      return this.circuitsService.create(projectId, createCircuitDto);
    }
  
    @Get()
    findAll(@Param('projectId') projectId: string) {
      return this.circuitsService.findAll(projectId);
    }
  }
  
  @Controller('circuits')
  export class CircuitDetailController {
    constructor(private readonly circuitsService: CircuitsService) {}
  
    @Get(':id')
    findOne(@Param('id') id: string) {
      return this.circuitsService.findOne(id);
    }
  
    @Put(':id')
    update(@Param('id') id: string, @Body() updateCircuitDto: UpdateCircuitDto) {
      return this.circuitsService.update(id, updateCircuitDto);
    }
  
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    remove(@Param('id') id: string) {
      return this.circuitsService.remove(id);
    } 
  
    @Post(':id/simulate')
    simulate(@Param('id') id: string, @Body() simulateDto: SimulateCircuitDto) {
      return this.circuitsService.simulate(id, simulateDto);
    }
  }