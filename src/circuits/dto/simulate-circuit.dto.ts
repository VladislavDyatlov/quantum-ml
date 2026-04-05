import { IsOptional, IsInt, Min } from 'class-validator';

export class SimulateCircuitDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  shots?: number; 
}