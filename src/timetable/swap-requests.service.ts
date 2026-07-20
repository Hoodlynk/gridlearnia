import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { EntryEditService } from './entry-edit.service';
import {
  CreateSwapRequestDto,
  DecideSwapRequestDto,
} from './dto/swap-request.dto';

const swapSelect = {
  id: true,
  status: true,
  reason: true,
  targetDay: true,
  decisionNote: true,
  decidedAt: true,
  createdAt: true,
  requestedBy: {
    select: { id: true, firstName: true, lastName: true, staffNumber: true },
  },
  entry: {
    select: {
      id: true,
      day: true,
      period: { select: { id: true, name: true, order: true } },
      class: { select: { id: true, name: true, grade: { select: { name: true } } } },
      subject: { select: { id: true, code: true, name: true } },
    },
  },
  targetEntry: {
    select: {
      id: true,
      day: true,
      period: { select: { id: true, name: true, order: true } },
      class: { select: { id: true, name: true, grade: { select: { name: true } } } },
      subject: { select: { id: true, code: true, name: true } },
    },
  },
  targetPeriod: { select: { id: true, name: true, order: true } },
} as const;

/**
 * Teacher-initiated swap requests (Phase 5d). A teacher proposes moving one of
 * their lessons (into a free slot, or by trading with another lesson); an
 * approver decides. Approval re-runs the full placement validation, so a request
 * that has gone stale is refused rather than corrupting the timetable.
 */
@Injectable()
export class SwapRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entryEdit: EntryEditService,
    private readonly mail: MailService,
  ) {}

  async create(tenantId: string, userId: string, dto: CreateSwapRequestDto) {
    const entry = await this.prisma.timetableEntry.findFirst({
      where: { id: dto.entryId, tenantId },
      select: {
        id: true,
        staffId: true,
        timetableId: true,
        timetable: { select: { status: true } },
      },
    });
    if (!entry) {
      throw new NotFoundException('Timetable entry not found');
    }
    if (entry.timetable.status === 'ARCHIVED') {
      throw new BadRequestException('Archived timetables are read-only');
    }

    if (!dto.targetEntryId && (dto.targetDay == null || !dto.targetPeriodId)) {
      throw new BadRequestException(
        'Provide either a lesson to swap with, or a target day and period',
      );
    }

    // A teacher may only request against their own lesson; a manager acting for
    // them is allowed (permission-gated at the controller).
    const actingStaff = await this.prisma.staff.findFirst({
      where: { tenantId, userId, deletedAt: null },
      select: { id: true },
    });
    if (actingStaff && actingStaff.id !== entry.staffId) {
      throw new ForbiddenException(
        'You can only request swaps for your own lessons',
      );
    }

    if (dto.targetEntryId) {
      const target = await this.prisma.timetableEntry.findFirst({
        where: { id: dto.targetEntryId, tenantId, timetableId: entry.timetableId },
        select: { id: true },
      });
      if (!target) {
        throw new BadRequestException(
          'The lesson to swap with is not in this timetable',
        );
      }
    }

    const created = await this.prisma.timetableSwapRequest.create({
      data: {
        tenantId,
        timetableId: entry.timetableId,
        entryId: entry.id,
        requestedById: entry.staffId,
        targetEntryId: dto.targetEntryId ?? null,
        targetDay: dto.targetDay ?? null,
        targetPeriodId: dto.targetPeriodId ?? null,
        reason: dto.reason ?? null,
      },
      select: swapSelect,
    });
    return created;
  }

  list(
    tenantId: string,
    filters: { status?: string; timetableId?: string },
  ) {
    return this.prisma.timetableSwapRequest.findMany({
      where: {
        tenantId,
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(filters.timetableId ? { timetableId: filters.timetableId } : {}),
      },
      select: swapSelect,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async approve(
    tenantId: string,
    id: string,
    reviewerUserId: string,
    dto: DecideSwapRequestDto,
  ) {
    const req = await this.getPending(tenantId, id);

    // Apply through the edit service, which re-checks every hard constraint.
    // If it throws, the request stays PENDING and the reviewer sees why.
    try {
      if (req.targetEntryId) {
        await this.entryEdit.swap(tenantId, req.entryId, req.targetEntryId);
      } else if (req.targetDay != null && req.targetPeriodId) {
        await this.entryEdit.move(
          tenantId,
          req.entryId,
          req.targetDay,
          req.targetPeriodId,
        );
      } else {
        throw new BadRequestException('This request is malformed');
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'cannot be applied';
      throw new BadRequestException(
        `This swap can no longer be applied: ${reason}. Reject it, or ask for a new request.`,
      );
    }

    const updated = await this.prisma.timetableSwapRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedById: reviewerUserId,
        decisionNote: dto.note ?? null,
        decidedAt: new Date(),
      },
      select: swapSelect,
    });
    void this.notify(tenantId, id, 'approved', dto.note);
    return updated;
  }

  async reject(
    tenantId: string,
    id: string,
    reviewerUserId: string,
    dto: DecideSwapRequestDto,
  ) {
    await this.getPending(tenantId, id);
    const updated = await this.prisma.timetableSwapRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: reviewerUserId,
        decisionNote: dto.note ?? null,
        decidedAt: new Date(),
      },
      select: swapSelect,
    });
    void this.notify(tenantId, id, 'rejected', dto.note);
    return updated;
  }

  /** The requesting teacher withdraws their own pending request. */
  async cancel(tenantId: string, id: string, userId: string) {
    const req = await this.getPending(tenantId, id);
    const actingStaff = await this.prisma.staff.findFirst({
      where: { tenantId, userId, deletedAt: null },
      select: { id: true },
    });
    if (actingStaff && actingStaff.id !== req.requestedById) {
      throw new ForbiddenException('You can only cancel your own requests');
    }
    return this.prisma.timetableSwapRequest.update({
      where: { id },
      data: { status: 'CANCELLED', decidedAt: new Date() },
      select: swapSelect,
    });
  }

  private async getPending(tenantId: string, id: string) {
    const req = await this.prisma.timetableSwapRequest.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        status: true,
        entryId: true,
        requestedById: true,
        targetEntryId: true,
        targetDay: true,
        targetPeriodId: true,
      },
    });
    if (!req) {
      throw new NotFoundException('Swap request not found');
    }
    if (req.status !== 'PENDING') {
      throw new BadRequestException(
        `This request is already ${req.status.toLowerCase()}`,
      );
    }
    return req;
  }

  /** Tell the requesting teacher the outcome (fire-and-forget). */
  private async notify(
    tenantId: string,
    id: string,
    outcome: 'approved' | 'rejected',
    note?: string,
  ): Promise<void> {
    const req = await this.prisma.timetableSwapRequest.findFirst({
      where: { id, tenantId },
      select: {
        requestedBy: {
          select: {
            firstName: true,
            email: true,
            user: { select: { email: true } },
          },
        },
        entry: {
          select: {
            subject: { select: { name: true } },
            class: { select: { name: true, grade: { select: { name: true } } } },
          },
        },
      },
    });
    const to = req?.requestedBy.email ?? req?.requestedBy.user?.email;
    if (!to || !req) return;
    const lesson = `${req.entry.subject.name} (${req.entry.class.grade.name} ${req.entry.class.name})`;
    void this.mail.sendSwapDecisionEmail(
      to,
      req.requestedBy.firstName,
      lesson,
      outcome,
      note,
    );
  }
}
