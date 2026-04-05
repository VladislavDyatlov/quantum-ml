import { IsString, IsInt, IsArray, ValidateNested, Min, Max, IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class GateDto {
  @IsString()
  gate: string; 

  @IsArray()
  @IsInt({ each: true })
  qubits: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  params?: number[]; 
}

export class CreateCircuitDto {
  @IsString()
  name: string;

  @IsInt()
  @Min(1)
  @Max(20) 
  qubitsCount: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GateDto)
  gates: GateDto[];
}