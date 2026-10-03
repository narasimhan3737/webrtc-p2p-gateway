import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { Organization } from '../entities/organization.entity';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtPayload } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Organization)
    private readonly orgs: Repository<Organization>,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    if (!dto.organizationName && !dto.joinOrganizationName) {
      throw new BadRequestException(
        'Provide organizationName (create) or joinOrganizationName (join)',
      );
    }
    if (dto.organizationName && dto.joinOrganizationName) {
      throw new BadRequestException(
        'Provide only one of organizationName or joinOrganizationName',
      );
    }

    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    let organization: Organization;
    let role: 'admin' | 'member' = dto.role ?? 'member';

    if (dto.organizationName) {
      const clash = await this.orgs.findOne({
        where: { name: dto.organizationName },
      });
      if (clash) {
        throw new ConflictException('Organization name already exists');
      }
      organization = await this.orgs.save(
        this.orgs.create({ name: dto.organizationName }),
      );
      role = 'admin';
    } else {
      const found = await this.orgs.findOne({
        where: { name: dto.joinOrganizationName },
      });
      if (!found) {
        throw new BadRequestException('Organization not found');
      }
      organization = found;
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.save(
      this.users.create({
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        role,
        organizationId: organization.id,
      }),
    );

    return this.tokenResponse(user, organization);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({
      where: { email: dto.email },
      relations: { organization: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.tokenResponse(user, user.organization);
  }

  async me(userId: string) {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: { organization: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      organization: {
        id: user.organization.id,
        name: user.organization.name,
      },
    };
  }

  private tokenResponse(user: User, organization: Organization) {
    const payload: JwtPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    };
    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        organization: {
          id: organization.id,
          name: organization.name,
        },
      },
    };
  }
}
