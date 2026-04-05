import { IsString, IsInt, IsOptional, IsNumber, Min, Max, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class GateDto {
  @IsString()
  gate!: string;

  @IsArray()
  @IsInt({ each: true })
  qubits!: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  params?: number[];
}

export class CreateCircuitDto {
  gate!: string;      
  qubits!: number[];
  name!: string;
  qubitsCount!: number;
  gates!: GateDto[];
}

export class CreateTrainingDto {
  @IsString()
  projectId!: string;

  @IsOptional()
  @IsString()
  circuitId?: string;

  @IsString()
  dataset!: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  epochs!: number;

  @IsNumber()
  @Min(0.0001)
  learningRate!: number;

  @IsInt()
  @Min(1)
  bondDim!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  qubitsCount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GateDto)
  gates?: GateDto[];
}