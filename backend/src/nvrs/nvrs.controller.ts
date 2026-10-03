import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { NvrsService } from './nvrs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CreateNvrDto } from './dto/create-nvr.dto';

@Controller('nvrs')
@UseGuards(JwtAuthGuard)
export class NvrsController {
  constructor(private readonly nvrs: NvrsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.nvrs.listForOrg(user.organizationId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.nvrs.getForOrg(id, user.organizationId);
  }

  @Post()
  create(@Body() dto: CreateNvrDto, @CurrentUser() user: AuthUser) {
    return this.nvrs.create(dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.nvrs.remove(id, user);
  }
}
