import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SchoolRequestDocumentType, SchoolRequestStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_ROOT_ROLE } from '../rbac/rbac.constants';
import { RbacService } from '../rbac/rbac.service';
import { StorageService } from '../storage/storage.service';
import { CreateSchoolRequestDto } from './dto/create-school-request.dto';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { SchoolRequestDocumentDto } from './dto/school-request-document.dto';

const requestSelect = {
  id: true,
  name: true,
  subdomain: true,
  status: true,
  applicantFullName: true,
  idNumber: true,
  phone: true,
  reason: true,
  reviewedAt: true,
  createdAt: true,
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
  documents: {
    select: {
      id: true,
      type: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
  },
};

const REQUIRED_DOCUMENT_TYPES: SchoolRequestDocumentType[] = [
  SchoolRequestDocumentType.ID_DOCUMENT,
  SchoolRequestDocumentType.SCHOOL_CERTIFICATE,
];

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
  ) {}

  /**
   * Presigned upload slot for a KYC document. The caller PUTs the file
   * directly to storage, then references the returned key in the create call.
   */
  async createUploadUrl(userId: string, dto: CreateUploadUrlDto) {
    await this.assertTenantlessUser(userId);

    const safeName = dto.fileName.replace(/[^\w.\-]/g, '_').slice(-100);
    const key = `${this.uploadPrefix(userId)}${DOCUMENT_FOLDERS[dto.type]}/${randomUUID()}/${safeName}`;
    const { url, expiresInSeconds } = await this.storageService.presignUpload(
      key,
      dto.mimeType,
    );
    return { key, uploadUrl: url, expiresInSeconds };
  }

  /** A platform user (no school yet) applies to create one. */
  async create(userId: string, dto: CreateSchoolRequestDto) {
    await this.assertTenantlessUser(userId);

    const pending = await this.prisma.schoolRequest.findFirst({
      where: { userId, status: SchoolRequestStatus.PENDING },
    });
    if (pending) {
      throw new ConflictException('You already have a pending school request');
    }

    await this.assertSubdomainAvailable(dto.subdomain);
    await this.assertDocumentsValid(userId, dto.documents);

    const request = await this.prisma.schoolRequest.create({
      data: {
        userId,
        name: dto.name,
        subdomain: dto.subdomain,
        applicantFullName: dto.applicantFullName,
        idNumber: dto.idNumber,
        phone: dto.phone,
        documents: {
          create: dto.documents.map((doc) => ({
            type: doc.type,
            fileKey: doc.key,
            fileName: doc.fileName,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes,
          })),
        },
      },
      select: requestSelect,
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
  ): Promise<void> {
    const prefix = this.uploadPrefix(userId);
    for (const doc of documents) {
      if (!doc.key.startsWith(prefix) || doc.key.includes('..')) {
        throw new BadRequestException(
          'Document key was not issued for this user',
        );
      }
    }

    for (const required of REQUIRED_DOCUMENT_TYPES) {
      if (!documents.some((doc) => doc.type === required)) {
        throw new BadRequestException(
          `A ${required.replace('_', ' ').toLowerCase()} upload is required`,
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

  async findMine(userId: string) {
    return this.prisma.schoolRequest.findMany({
      where: { userId },
      select: requestSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Platform (SUPER_ADMIN) listing. */
  async findAll(status?: SchoolRequestStatus) {
    return this.prisma.schoolRequest.findMany({
      where: status ? { status } : {},
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
    const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const row of grouped) {
      counts[row.status] = row._count._all;
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

    // Exclude the request being approved from its own conflict check.
    await this.assertSubdomainAvailable(request.subdomain, request.id);

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
        data: { name: request.name, subdomain: request.subdomain },
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

    return {
      request: { id: request.id, status: SchoolRequestStatus.APPROVED },
      tenant: { id: tenant.id, name: tenant.name, subdomain: tenant.subdomain },
      organizationAdmin: { id: request.userId, email: request.user.email },
    };
  }

  async reject(requestId: string, reviewerId: string, reason?: string) {
    const request = await this.prisma.schoolRequest.findUnique({
      where: { id: requestId },
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

    return rejected;
  }

  private async assertSubdomainAvailable(
    subdomain: string,
    excludeRequestId?: string,
  ): Promise<void> {
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
    if (tenant || pendingRequest) {
      throw new ConflictException('Subdomain is already taken or requested');
    }
  }
}
