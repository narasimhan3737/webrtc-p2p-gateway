import { IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class CreateCameraDto {
  @IsString()
  @MinLength(1)
  name: string;

  /** Existing DM Mediaserver stream key (import). Required if rtspUrl omitted. */
  @ValidateIf((o: CreateCameraDto) => !o.rtspUrl)
  @IsString()
  @MinLength(1)
  streamKey?: string;

  /** RTSP URL to register on DM Mediaserver. Required if streamKey omitted. */
  @ValidateIf((o: CreateCameraDto) => !o.streamKey)
  @IsString()
  @MinLength(1)
  rtspUrl?: string;

  @IsOptional()
  @IsIn(['main', 'sub'])
  variant?: 'main' | 'sub';
}
