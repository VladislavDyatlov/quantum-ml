import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SimulatorService } from '../simulator/simulator.service';
import { CreateCircuitDto } from './dto/create-circuit.dto';
import { UpdateCircuitDto } from './dto/update-circuit.dto';
import { SimulateCircuitDto } from './dto/simulate-circuit.dto';
import { GateDto } from './dto/gate.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CircuitsService {
  constructor(
    private prisma: PrismaService,
    private simulator: SimulatorService,
  ) {}

  async create(projectId: string, createCircuitDto: CreateCircuitDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project)
      throw new NotFoundException(`Project with ID ${projectId} not found`);

    return this.prisma.circuit.create({
      data: {
        name: createCircuitDto.name,
        qubitsCount: createCircuitDto.qubitsCount,
        gates: createCircuitDto.gates as unknown as Prisma.InputJsonValue,
        projectId,
      },
    });
  }

  async findAll(projectId: string) {
    return this.prisma.circuit.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const circuit = await this.prisma.circuit.findUnique({ where: { id } });
    if (!circuit)
      throw new NotFoundException(`Circuit with ID ${id} not found`);
    return circuit;
  }

  async update(id: string, updateCircuitDto: UpdateCircuitDto) {
    try {
      const data: Prisma.CircuitUpdateInput = {};
      if (updateCircuitDto.name !== undefined)
        data.name = updateCircuitDto.name;
      if (updateCircuitDto.qubitsCount !== undefined)
        data.qubitsCount = updateCircuitDto.qubitsCount;
      if (updateCircuitDto.gates !== undefined) {
        data.gates = updateCircuitDto.gates as unknown as Prisma.InputJsonValue;
      }

      return await this.prisma.circuit.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )
        throw new NotFoundException(`Circuit with ID ${id} not found`);
      throw error;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.circuit.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )
        throw new NotFoundException(`Circuit with ID ${id} not found`);
      throw error;
    }
  }

  async simulate(id: string, simulateDto: SimulateCircuitDto) {
    const circuit = await this.findOne(id);
    if (!circuit.gates || !Array.isArray(circuit.gates)) {
      throw new Error('Invalid circuit gates data');
    }
    let gates = circuit.gates as unknown as GateDto[];
    gates = gates.map((gate) => ({
      ...gate,
      gate: gate.gate.toUpperCase(),
    }));
    for (const gate of gates) {
      if (!gate.gate || !Array.isArray(gate.qubits)) {
        throw new Error('Invalid gate format in circuit');
      }
    }
    const shots = simulateDto.shots;
    return this.simulator.simulate(gates, circuit.qubitsCount, shots);
  }
}
