import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InvitationsService } from '../invitations/invitations.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStaffDto,
  InviteStaffDto,
  UpdateStaffDto,
} from './dto/staff.dto';

const staffListSelect = {
  id: true,
  staffNumber: true,
  title: true,
  firstName: true,
  lastName: true,
  email: true,
  employmentType: true,
  status: true,
  // Portal access: null = no login account linked yet.
  userId: true,
  campus: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
} satisfies Prisma.StaffSelect;

const staffDetailSelect = {
  ...staffListSelect,
  middleName: true,
  email: true,
  phone: true,
  joinedOn: true,
  userId: true,
  headOfDepartments: { select: { id: true, name: true } },
} satisfies Prisma.StaffSelect;

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationsService,
  ) {}

  async list(
    tenantId: string,
    filters: { search?: string; departmentId?: string; status?: string },
  ) {
    const search = filters.search?.trim();
    return this.prisma.staff.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { staffNumber: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: staffListSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async get(tenantId: string, id: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: staffDetailSelect,
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
    return staff;
  }

  async create(tenantId: string, dto: CreateStaffDto) {
    await this.assertCampus(tenantId, dto.campusId);
    if (dto.departmentId) {
      await this.assertDepartment(tenantId, dto.departmentId);
    }
    try {
      return await this.prisma.staff.create({
        data: {
          tenantId,
          campusId: dto.campusId,
          departmentId: dto.departmentId ?? null,
          staffNumber: dto.staffNumber,
          title: dto.title ?? null,
          firstName: dto.firstName,
          middleName: dto.middleName ?? null,
          lastName: dto.lastName,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          employmentType: dto.employmentType ?? 'FULL_TIME',
          status: dto.status ?? 'ACTIVE',
          joinedOn: dto.joinedOn ? new Date(dto.joinedOn) : null,
        },
        select: staffDetailSelect,
      });
    } catch (e) {
      throw this.mapStaffNumberConflict(e);
    }
  }

  async update(tenantId: string, id: string, dto: UpdateStaffDto) {
    await this.getOwned(tenantId, id);
    if (dto.campusId) {
      await this.assertCampus(tenantId, dto.campusId);
    }
    if (dto.departmentId) {
      await this.assertDepartment(tenantId, dto.departmentId);
    }
    try {
      return await this.prisma.staff.update({
        where: { id },
        data: {
          ...(dto.campusId !== undefined ? { campusId: dto.campusId } : {}),
          ...(dto.departmentId !== undefined
            ? { departmentId: dto.departmentId }
            : {}),
          ...(dto.staffNumber !== undefined
            ? { staffNumber: dto.staffNumber }
            : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.middleName !== undefined
            ? { middleName: dto.middleName }
            : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.employmentType !== undefined
            ? { employmentType: dto.employmentType }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.joinedOn !== undefined
            ? { joinedOn: dto.joinedOn ? new Date(dto.joinedOn) : null }
            : {}),
        },
        select: staffDetailSelect,
      });
    } catch (e) {
      throw this.mapStaffNumberConflict(e);
    }
  }

  async remove(tenantId: string, id: string) {
    await this.getOwned(tenantId, id);

    // Protective delete: refuse while this person still holds responsibilities,
    // so nothing silently loses its HOD / class teacher / teacher.
    const [asHead, asClassTeacher, assignments] = await Promise.all([
      this.prisma.department.count({ where: { tenantId, headId: id } }),
      this.prisma.class.count({
        where: { tenantId, classTeacherId: id, deletedAt: null },
      }),
      this.prisma.teachingAssignment.count({ where: { tenantId, staffId: id } }),
    ]);
    if (asHead > 0) {
      throw new BadRequestException(
        'This staff member heads a department — reassign the HOD first',
      );
    }
    if (asClassTeacher > 0) {
      throw new BadRequestException(
        'This staff member is a class teacher — reassign the class first',
      );
    }
    if (assignments > 0) {
      throw new BadRequestException(
        'This staff member has teaching assignments — remove them first',
      );
    }

    await this.prisma.staff.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  /**
   * Invite a staff member to the portal. Delegates to the invitation flow (so
   * roles, expiry and token hashing stay in one place) but tags the invite with
   * this staffId, so accepting it links the new account to this profile.
   */
  async invite(
    tenantId: string,
    invitedBy: string,
    id: string,
    dto: InviteStaffDto,
  ) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, email: true, userId: true },
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
    if (staff.userId) {
      throw new ConflictException(
        'This staff member already has a linked account',
      );
    }
    const email = dto.email ?? staff.email;
    if (!email) {
      throw new BadRequestException(
        'This staff member has no email address — provide one to invite them',
      );
    }
    return this.invitations.create(
      tenantId,
      invitedBy,
      { email, roleKeys: dto.roleKeys },
      staff.id,
    );
  }

  /** Link (or unlink) an existing school user to this staff profile. */
  async linkUser(tenantId: string, id: string, userId: string | null) {
    await this.getOwned(tenantId, id);

    if (userId) {
      const user = await this.prisma.user.findFirst({
        where: { id: userId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!user) {
        throw new BadRequestException('User not found in this school');
      }
      // Staff.userId is unique — surface a clear error instead of a raw 500.
      const taken = await this.prisma.staff.findFirst({
        where: { userId, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException(
          'That user is already linked to another staff member',
        );
      }
    }

    return this.prisma.staff.update({
      where: { id },
      data: { userId },
      select: staffDetailSelect,
    });
  }

  private async getOwned(tenantId: string, id: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
    return staff;
  }

  private async assertCampus(tenantId: string, campusId: string) {
    const campus = await this.prisma.campus.findFirst({
      where: { id: campusId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!campus) {
      throw new BadRequestException('Campus not found for this school');
    }
  }

  private async assertDepartment(tenantId: string, departmentId: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id: departmentId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!dept) {
      throw new BadRequestException('Department not found for this school');
    }
  }

  private mapStaffNumberConflict(e: unknown) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException(
        'A staff member with this staff number already exists',
      );
    }
    return e;
  }
}
