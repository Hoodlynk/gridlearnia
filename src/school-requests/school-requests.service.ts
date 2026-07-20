import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentSide,
  IdDocumentType,
  SchoolRequestDocumentType,
  SchoolRequestStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { schoolNameKey } from '../common/utils/school-name-key';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_ROOT_ROLE } from '../rbac/rbac.constants';
import { RbacService } from '../rbac/rbac.service';
import {
  buildDefaultAcademicYear,
  orderedSections,
} from '../tenants/academic-provisioning';
import { DEFAULT_MODULE_STATE } from '../tenants/tenant-modules.constants';
import { StorageService } from '../storage/storage.service';
import { CreateSchoolRequestDto } from './dto/create-school-request.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { SchoolRequestDocumentDto } from './dto/school-request-document.dto';

const requestSelect = {
  id: true,
  name: true,
  subdomain: true,
  status: true,
  applicantFullName: true,
  idType: true,
  idNumber: true,
  phone: true,
  sections: true,
  reason: true,
  reviewedAt: true,
  createdAt: true,
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
  documents: {
    select: {
      id: true,
      type: true,
      side: true,
      // The key lives in the owner's own upload namespace — exposing it
      // lets a draft be resumed (documents re-referenced) from the client.
      fileKey: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
  },
};

// After this many rejected applications the account can no longer apply —
// repeated failed KYC is a fraud signal, and each attempt costs review time.
const MAX_REJECTED_REQUESTS = 3;

/** Folder name per document type — keeps the bucket browsable by category. */
const DOCUMENT_FOLDERS: Record<SchoolRequestDocumentType, string> = {
  [SchoolRequestDocumentType.ID_DOCUMENT]: 'id-documents',
  [SchoolRequestDocumentType.SCHOOL_CERTIFICATE]: 'school-certificates',
};

@Injectable()
export class SchoolRequestsService {
  private readonly logger = new Logger(SchoolRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacService: RbacService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Store a KYC document server-side (browser → API → Spaces, so the
   * shared bucket needs no CORS rules). The returned key is what the
   * create call references in its documents array.
   */
  async uploadDocument(
    userId: string,
    type: SchoolRequestDocumentType,
    file: { buffer: Buffer; fileName: string; mimeType: string },
  ) {
    await this.assertTenantlessUser(userId);

    const safeName = file.fileName.replace(/[^\w.\-]/g, '_').slice(-100);
    const key = `${this.uploadPrefix(userId)}${DOCUMENT_FOLDERS[type]}/${randomUUID()}/${safeName}`;
    await this.storageService.putObject(key, file.buffer, file.mimeType);
    return {
      key,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.buffer.length,
    };
  }

  /**
   * Save (or update) the user's draft application. A draft exists so that
   * a failed upload or an interrupted session never loses the application —
   * documents are optional here and the name/subdomain aren't reserved
   * until the draft is submitted for review.
   */
  async saveDraft(userId: string, dto: SaveDraftDto) {
    await this.assertTenantlessUser(userId);

    const pending = await this.prisma.schoolRequest.findFirst({
      where: { userId, status: SchoolRequestStatus.PENDING },
    });
    if (pending) {
      throw new ConflictException('You already have a pending school request');
    }

    const nameKey = schoolNameKey(dto.name);
    if (!nameKey) {
      throw new BadRequestException(
        'School name must contain letters or numbers',
      );
    }

    const documents = dto.documents ?? [];
    await this.assertDocumentKeysValid(userId, documents);

    const fields = {
      name: dto.name,
      nameKey,
      subdomain: dto.subdomain,
      applicantFullName: dto.applicantFullName,
      idType: dto.idType,
      idNumber: dto.idNumber,
      phone: dto.phone,
      sections: dto.sections ?? [],
    };
    const documentRows = documents.map((doc) => ({
      type: doc.type,
      side: doc.side ?? null,
      fileKey: doc.key,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
    }));

    // CHANGES_REQUESTED behaves like a draft for the owner: the reviewer
    // sent it back, so it stays editable until resubmitted.
    const existing = await this.prisma.schoolRequest.findFirst({
      where: {
        userId,
        status: {
          in: [
            SchoolRequestStatus.DRAFT,
            SchoolRequestStatus.CHANGES_REQUESTED,
          ],
        },
      },
    });

    if (!existing) {
      await this.assertNotRejectionLocked(userId);
    }

    const draft = existing
      ? await this.prisma.schoolRequest.update({
          where: { id: existing.id },
          data: {
            ...fields,
            documents: { deleteMany: {}, create: documentRows },
          },
          select: requestSelect,
        })
      : await this.prisma.schoolRequest.create({
          data: {
            userId,
            status: SchoolRequestStatus.DRAFT,
            ...fields,
            documents: { create: documentRows },
          },
          select: requestSelect,
        });

    return draft;
  }

  /**
   * Promote the user's draft to a real application (DRAFT → PENDING).
   * All submission rules run here: required documents present, and the
   * subdomain/name still available.
   */
  async submitDraft(userId: string) {
    await this.assertTenantlessUser(userId);

    const draft = await this.prisma.schoolRequest.findFirst({
      where: {
        userId,
        status: {
          in: [
            SchoolRequestStatus.DRAFT,
            SchoolRequestStatus.CHANGES_REQUESTED,
          ],
        },
      },
      include: { documents: true },
    });
    if (!draft) {
      throw new NotFoundException('You have no draft application');
    }

    await this.assertSubdomainAvailable(draft.subdomain, draft.id);
    await this.assertNameAvailable(schoolNameKey(draft.name), draft.id);
    this.assertRequiredDocuments(draft.documents, draft.idType);
    await this.assertDocumentKeysValid(
      userId,
      draft.documents.map((doc) => ({
        type: doc.type,
        key: doc.fileKey,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
      })),
    );

    const submitted = await this.prisma.schoolRequest.update({
      where: { id: draft.id },
      // A resubmission starts a fresh review: clear the previous outcome.
      data: {
        status: SchoolRequestStatus.PENDING,
        reason: null,
        reviewedBy: null,
        reviewedAt: null,
      },
      select: requestSelect,
    });

    this.logger.log(
      `School request submitted from draft: ${draft.subdomain} by ${submitted.user.email}`,
    );
    return submitted;
  }

  /** A platform user (no school yet) applies to create one. */
  async create(userId: string, dto: CreateSchoolRequestDto) {
    await this.assertTenantlessUser(userId);
    await this.assertNotRejectionLocked(userId);

    const pending = await this.prisma.schoolRequest.findFirst({
      where: { userId, status: SchoolRequestStatus.PENDING },
    });
    if (pending) {
      throw new ConflictException('You already have a pending school request');
    }

    const nameKey = schoolNameKey(dto.name);
    if (!nameKey) {
      throw new BadRequestException(
        'School name must contain letters or numbers',
      );
    }

    await this.assertSubdomainAvailable(dto.subdomain);
    await this.assertNameAvailable(nameKey);
    await this.assertDocumentsValid(userId, dto.documents, dto.idType);

    const request = await this.prisma.schoolRequest.create({
      data: {
        userId,
        name: dto.name,
        nameKey,
        subdomain: dto.subdomain,
        applicantFullName: dto.applicantFullName,
        idType: dto.idType,
        idNumber: dto.idNumber,
        phone: dto.phone,
        sections: dto.sections ?? [],
        documents: {
          create: dto.documents.map((doc) => ({
            type: doc.type,
            side: doc.side ?? null,
            fileKey: doc.key,
            fileName: doc.fileName,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes,
          })),
        },
      },
      select: requestSelect,
    });

    // A direct submission supersedes any draft the user still had.
    await this.prisma.schoolRequest.deleteMany({
      where: { userId, status: SchoolRequestStatus.DRAFT },
    });

    this.logger.log(
      `School request created: ${dto.subdomain} by ${request.user.email}`,
    );
    return request;
  }

  /**
   * SUPER_ADMIN: short-lived signed download URL for a KYC document.
   * Files are private in storage — this is the only read path.
   */
  async documentDownloadUrl(requestId: string, documentId: string) {
    const document = await this.prisma.schoolRequestDocument.findFirst({
      where: { id: documentId, schoolRequestId: requestId },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return this.storageService.presignDownload(
      document.fileKey,
      document.fileName,
    );
  }

  /**
   * Keys live under the app's shared-bucket folder and are namespaced per
   * user so a request can never reference someone else's upload:
   * Gridlearnia/school-requests/<userId>/<category>/<uuid>/<file>
   */
  private uploadPrefix(userId: string): string {
    return `${this.storageService.rootPrefix}/school-requests/${userId}/`;
  }

  /**
   * Accounts with MAX_REJECTED_REQUESTS rejected applications can no longer
   * apply. Editing/resubmitting an existing sent-back request is unaffected
   * — this only gates starting a new application.
   */
  private async assertNotRejectionLocked(userId: string): Promise<void> {
    const rejections = await this.prisma.schoolRequest.count({
      where: { userId, status: SchoolRequestStatus.REJECTED },
    });
    if (rejections >= MAX_REJECTED_REQUESTS) {
      throw new ForbiddenException(
        `Your applications have been rejected ${MAX_REJECTED_REQUESTS} times — this account can no longer apply to create a school. Contact support if you believe this is a mistake.`,
      );
    }
  }

  private async assertTenantlessUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.tenantId) {
      throw new ConflictException('You already belong to a school');
    }
  }

  /**
   * Documents must cover both required types, reference only this user's
   * upload namespace, and (when storage is reachable) actually exist.
   */
  private async assertDocumentsValid(
    userId: string,
    documents: SchoolRequestDocumentDto[],
    idType: IdDocumentType,
  ): Promise<void> {
    await this.assertDocumentKeysValid(userId, documents);
    this.assertRequiredDocuments(documents, idType);
  }

  /**
   * Key-level checks that apply to drafts too: every referenced document
   * must live in this user's upload namespace and actually exist in storage.
   */
  private async assertDocumentKeysValid(
    userId: string,
    documents: SchoolRequestDocumentDto[],
  ): Promise<void> {
    const prefix = this.uploadPrefix(userId);
    for (const doc of documents) {
      if (!doc.key.startsWith(prefix) || doc.key.includes('..')) {
        throw new BadRequestException(
          'Document key was not issued for this user',
        );
      }
    }

    if (this.storageService.isConfigured) {
      const stats = await Promise.all(
        documents.map((doc) => this.storageService.statObject(doc.key)),
      );
      const missing = stats.findIndex((stat) => stat === null);
      if (missing !== -1) {
        throw new BadRequestException(
          `"${documents[missing].fileName}" was not uploaded — upload it and try again`,
        );
      }
    }
  }

  /**
   * Submission-time rule: a school certificate is always required, and the
   * identity document depends on its kind — a national ID needs both the
   * front and the back scan, a passport just the photo page.
   */
  private assertRequiredDocuments(
    documents: { type: SchoolRequestDocumentType; side?: DocumentSide | null }[],
    idType: IdDocumentType | null,
  ): void {
    if (
      !documents.some(
        (doc) => doc.type === SchoolRequestDocumentType.SCHOOL_CERTIFICATE,
      )
    ) {
      throw new BadRequestException(
        'A school certificate upload is required',
      );
    }

    const idDocs = documents.filter(
      (doc) => doc.type === SchoolRequestDocumentType.ID_DOCUMENT,
    );
    if (idType === IdDocumentType.NATIONAL_ID) {
      const hasFront = idDocs.some((doc) => doc.side === DocumentSide.FRONT);
      const hasBack = idDocs.some((doc) => doc.side === DocumentSide.BACK);
      if (!hasFront || !hasBack) {
        throw new BadRequestException(
          'National ID uploads must include both the front and the back',
        );
      }
      return;
    }
    if (idDocs.length === 0) {
      throw new BadRequestException(
        idType === IdDocumentType.PASSPORT
          ? 'A passport (photo page) upload is required'
          : 'An identity document upload is required',
      );
    }
  }

  async findMine(userId: string) {
    return this.prisma.schoolRequest.findMany({
      where: { userId },
      select: requestSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Platform (SUPER_ADMIN) listing. Drafts are the user's private WIP — never listed. */
  async findAll(status?: SchoolRequestStatus) {
    return this.prisma.schoolRequest.findMany({
      where:
        status && status !== SchoolRequestStatus.DRAFT
          ? { status }
          : { status: { not: SchoolRequestStatus.DRAFT } },
      select: requestSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Platform (SUPER_ADMIN) status counts — one grouped count query. */
  async stats() {
    const grouped = await this.prisma.schoolRequest.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const counts = { PENDING: 0, CHANGES_REQUESTED: 0, APPROVED: 0, REJECTED: 0 };
    for (const row of grouped) {
      // Drafts are private WIP — not part of the review pipeline counts.
      if (row.status !== SchoolRequestStatus.DRAFT) {
        counts[row.status] = row._count._all;
      }
    }
    return counts;
  }

  /**
   * SUPER_ADMIN approval: creates the tenant and binds the requester as its
   * ORGANIZATION_ADMIN in one transaction. The org-admin grant only ever
   * happens here — there is no standing "school creator" role.
   */
  async approve(requestId: string, reviewerId: string) {
    const request = await this.prisma.schoolRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });
    if (!request) {
      throw new NotFoundException('School request not found');
    }
    if (request.status !== SchoolRequestStatus.PENDING) {
      throw new BadRequestException(`Request is already ${request.status}`);
    }
    if (request.user.tenantId) {
      throw new ConflictException(
        'The requester has joined another school since applying',
      );
    }

    // Exclude the request being approved from its own conflict checks.
    await this.assertSubdomainAvailable(request.subdomain, request.id);
    await this.assertNameAvailable(schoolNameKey(request.name), request.id);

    const rootRole = await this.prisma.role.findFirst({
      where: { key: TENANT_ROOT_ROLE, tenantId: null },
    });
    if (!rootRole) {
      throw new BadRequestException(
        'System roles are not seeded — run `npm run prisma:seed` first',
      );
    }

    const tenant = await this.prisma.$transaction(async (tx) => {
      const newTenant = await tx.tenant.create({
        data: {
          name: request.name,
          nameKey: schoolNameKey(request.name),
          subdomain: request.subdomain,
        },
      });
      // Every school starts with one physical site. Single-campus schools
      // never touch this; multi-site schools add more later. Operational
      // records will hang off a campus, so it must exist from day one.
      const mainCampus = await tx.campus.create({
        data: {
          tenantId: newTenant.id,
          name: 'Main Campus',
          code: 'MAIN',
          isMain: true,
        },
      });

      // Turn the applicant's structure choice into Section rows under the main
      // campus (curriculum/grading assigned later). Empty = they skipped it.
      const sections = orderedSections(request.sections);
      if (sections.length > 0) {
        await tx.section.createMany({
          data: sections.map((section) => ({
            tenantId: newTenant.id,
            campusId: mainCampus.id,
            name: section.name,
            order: section.order,
          })),
        });
      }

      // Give the school a ready-to-edit calendar: the current year + its
      // default terms, marked current.
      const year = buildDefaultAcademicYear();
      await tx.academicYear.create({
        data: {
          tenantId: newTenant.id,
          name: year.name,
          startDate: year.startDate,
          endDate: year.endDate,
          isCurrent: year.isCurrent,
          terms: { create: year.terms },
        },
      });
      // Seed the full module catalogue with its default on/off state so the
      // console can list every module with a toggle from the start.
      await tx.tenantModule.createMany({
        data: DEFAULT_MODULE_STATE.map((m) => ({
          tenantId: newTenant.id,
          moduleKey: m.moduleKey,
          enabled: m.enabled,
        })),
      });
      await tx.user.update({
        where: { id: request.userId },
        data: { tenantId: newTenant.id },
      });
      await tx.userRole.create({
        data: { userId: request.userId, roleId: rootRole.id },
      });
      await tx.schoolRequest.update({
        where: { id: request.id },
        data: {
          status: SchoolRequestStatus.APPROVED,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
        },
      });
      return newTenant;
    });

    this.rbacService.invalidate(request.userId);
    this.logger.log(
      `School approved: ${tenant.subdomain} (org admin: ${request.user.email})`,
    );

    void this.auditService.record({
      action: 'SCHOOL_REQUEST_APPROVED',
      tenantId: tenant.id,
      actorId: reviewerId,
      resourceType: 'school_request',
      resourceId: request.id,
      metadata: {
        school: tenant.name,
        subdomain: tenant.subdomain,
        organizationAdmin: request.user.email,
      },
      summary: `School "${tenant.name}" (${tenant.subdomain}) approved — ${TENANT_ROOT_ROLE}: ${request.user.email}`,
      critical: true, // creates a tenant root
    });

    void this.mailService.sendSchoolApprovedEmail(
      request.user.email,
      tenant.name,
    );

    return {
      request: { id: request.id, status: SchoolRequestStatus.APPROVED },
      tenant: { id: tenant.id, name: tenant.name, subdomain: tenant.subdomain },
      organizationAdmin: { id: request.userId, email: request.user.email },
    };
  }

  /**
   * SUPER_ADMIN review outcome: send the application back for corrections.
   * Unlike reject this is not terminal — the request becomes editable again
   * for the applicant, with the reviewer's comments attached.
   */
  async requestChanges(requestId: string, reviewerId: string, comments: string) {
    const request = await this.prisma.schoolRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });
    if (!request) {
      throw new NotFoundException('School request not found');
    }
    if (request.status !== SchoolRequestStatus.PENDING) {
      throw new BadRequestException(`Request is already ${request.status}`);
    }

    const updated = await this.prisma.schoolRequest.update({
      where: { id: requestId },
      data: {
        status: SchoolRequestStatus.CHANGES_REQUESTED,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reason: comments,
      },
      select: requestSelect,
    });

    void this.auditService.record({
      action: 'SCHOOL_REQUEST_CHANGES_REQUESTED',
      actorId: reviewerId,
      resourceType: 'school_request',
      resourceId: requestId,
      metadata: {
        school: request.name,
        subdomain: request.subdomain,
        comments,
      },
      summary: `School request "${request.name}" (${request.subdomain}) sent back for changes`,
    });

    void this.mailService.sendSchoolChangesRequestedEmail(
      request.user.email,
      request.name,
      comments,
    );

    return updated;
  }

  async reject(requestId: string, reviewerId: string, reason?: string) {
    const request = await this.prisma.schoolRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });
    if (!request) {
      throw new NotFoundException('School request not found');
    }
    if (request.status !== SchoolRequestStatus.PENDING) {
      throw new BadRequestException(`Request is already ${request.status}`);
    }

    const rejected = await this.prisma.schoolRequest.update({
      where: { id: requestId },
      data: {
        status: SchoolRequestStatus.REJECTED,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reason,
      },
      select: requestSelect,
    });

    void this.auditService.record({
      action: 'SCHOOL_REQUEST_REJECTED',
      actorId: reviewerId,
      resourceType: 'school_request',
      resourceId: requestId,
      metadata: { school: request.name, subdomain: request.subdomain, reason },
      summary: `School request "${request.name}" (${request.subdomain}) rejected`,
    });

    const rejectionCount = await this.prisma.schoolRequest.count({
      where: { userId: request.userId, status: SchoolRequestStatus.REJECTED },
    });
    void this.mailService.sendSchoolRejectedEmail(
      request.user.email,
      request.name,
      reason ?? null,
      Math.max(0, MAX_REJECTED_REQUESTS - rejectionCount),
    );

    return rejected;
  }

  /** Availability probe for the create-school wizard's first step. */
  async availability(subdomain: string, name: string) {
    const nameKey = schoolNameKey(name);
    const [subdomainAvailable, nameAvailable] = await Promise.all([
      this.isSubdomainAvailable(subdomain),
      nameKey ? this.isNameAvailable(nameKey) : Promise.resolve(false),
    ]);
    return { subdomainAvailable, nameAvailable };
  }

  private async isSubdomainAvailable(
    subdomain: string,
    excludeRequestId?: string,
  ): Promise<boolean> {
    const [tenant, pendingRequest] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { subdomain } }),
      this.prisma.schoolRequest.findFirst({
        where: {
          subdomain,
          status: SchoolRequestStatus.PENDING,
          ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
        },
      }),
    ]);
    return !tenant && !pendingRequest;
  }

  private async assertSubdomainAvailable(
    subdomain: string,
    excludeRequestId?: string,
  ): Promise<void> {
    if (!(await this.isSubdomainAvailable(subdomain, excludeRequestId))) {
      throw new ConflictException('Subdomain is already taken or requested');
    }
  }

  private async isNameAvailable(
    nameKey: string,
    excludeRequestId?: string,
  ): Promise<boolean> {
    const [tenant, pendingRequest] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { nameKey } }),
      this.prisma.schoolRequest.findFirst({
        where: {
          nameKey,
          status: SchoolRequestStatus.PENDING,
          ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
        },
      }),
    ]);
    return !tenant && !pendingRequest;
  }

  private async assertNameAvailable(
    nameKey: string,
    excludeRequestId?: string,
  ): Promise<void> {
    if (!(await this.isNameAvailable(nameKey, excludeRequestId))) {
      throw new ConflictException(
        'A school with this name already exists or has been requested',
      );
    }
  }
}
