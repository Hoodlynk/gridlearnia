import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGuardianDto, UpdateGuardianDto } from './dto/guardian.dto';

const guardianSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  occupation: true,
  address: true,
  _count: { select: { students: true } },
} satisfies Prisma.GuardianSelect;

@Injectable()
export class GuardiansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, search?: string) {
    const q = search?.trim();
    return this.prisma.guardian.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: guardianSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateGuardianDto) {
    return this.prisma.guardian.create({
      data: {
        tenantId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        email: dto.email ?? null,
        occupation: dto.occupation ?? null,
        address: dto.address ?? null,
      },
      select: guardianSelect,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateGuardianDto) {
    await this.getOwned(tenantId, id);
    return this.prisma.guardian.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.occupation !== undefined
          ? { occupation: dto.occupation }
          : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
      },
      select: guardianSelect,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.getOwned(tenantId, id);
    const links = await this.prisma.studentGuardian.count({
      where: { guardianId: id },
    });
    if (links > 0) {
      throw new BadRequestException(
        'This guardian is still linked to students — unlink them before deleting',
      );
    }
    await this.prisma.guardian.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  private async getOwned(tenantId: string, id: string) {
    const guardian = await this.prisma.guardian.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!guardian) {
      throw new NotFoundException('Guardian not found');
    }
    return guardian;
  }
}
