import { IsString, MinLength } from 'class-validator';

export class CreateNvrDto {
  @IsString()
  @MinLength(1)
  name: string;
}
