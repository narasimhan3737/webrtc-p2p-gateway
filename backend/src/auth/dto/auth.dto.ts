import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsString()
  @MinLength(1)
  displayName: string;

  /** Create a new organization with this name (user becomes admin). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  organizationName?: string;

  /** Join an existing organization by name. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  joinOrganizationName?: string;

  @IsOptional()
  @IsIn(['admin', 'member'])
  role?: 'admin' | 'member';
}
