import { PrismaClient, ChannelCode, OrganizationType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const PERMISSIONS = [
  { code: 'orgs:read', name: 'Read organizations', resource: 'orgs', action: 'read' },
  { code: 'orgs:write', name: 'Write organizations', resource: 'orgs', action: 'write' },
  { code: 'users:read', name: 'Read users', resource: 'users', action: 'read' },
  { code: 'users:write', name: 'Write users', resource: 'users', action: 'write' },
  { code: 'roles:read', name: 'Read roles', resource: 'roles', action: 'read' },
  { code: 'roles:write', name: 'Write roles', resource: 'roles', action: 'write' },
  { code: 'api_keys:read', name: 'Read API keys', resource: 'api_keys', action: 'read' },
  { code: 'api_keys:write', name: 'Write API keys', resource: 'api_keys', action: 'write' },
  { code: 'messages:read', name: 'Read messages', resource: 'messages', action: 'read' },
  { code: 'messages:write', name: 'Write messages', resource: 'messages', action: 'write' },
  { code: 'accounts:read', name: 'Read accounts', resource: 'accounts', action: 'read' },
  { code: 'accounts:write', name: 'Write accounts', resource: 'accounts', action: 'write' },
  { code: 'webhooks:read', name: 'Read webhooks', resource: 'webhooks', action: 'read' },
  { code: 'settings:write', name: 'Write settings', resource: 'settings', action: 'write' },
] as const;

async function main(): Promise<void> {
  console.log('Seeding communication-platform...');

  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: {
        id: randomUUID(),
        code: p.code,
        name: p.name,
        resource: p.resource,
        action: p.action,
      },
      update: {
        name: p.name,
        resource: p.resource,
        action: p.action,
      },
    });
  }

  const channel = await prisma.communicationChannel.upsert({
    where: { code: ChannelCode.WHATSAPP },
    create: {
      id: randomUUID(),
      code: ChannelCode.WHATSAPP,
      name: 'WhatsApp Cloud API',
      description: 'Meta WhatsApp Business Platform',
      isActive: true,
      capabilities: {
        text: true,
        media: true,
        templates: true,
        readReceipts: true,
      },
    },
    update: { isActive: true },
  });

  let org = await prisma.organization.findUnique({ where: { slug: 'system' } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        id: randomUUID(),
        name: 'System',
        slug: 'system',
        type: OrganizationType.SYSTEM,
        status: 'ACTIVE',
        settings: {
          create: { id: randomUUID() },
        },
      },
    });
    console.log('Created SYSTEM organization');
  }

  let adminRole = await prisma.role.findFirst({
    where: { name: 'admin', organizationId: org.id },
  });
  if (!adminRole) {
    adminRole = await prisma.role.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        name: 'admin',
        description: 'Full platform administrator',
        isSystem: true,
      },
    });
  }

  const allPermissions = await prisma.permission.findMany();
  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      },
      create: {
        roleId: adminRole.id,
        permissionId: permission.id,
      },
      update: {},
    });
  }

  const adminEmail = 'admin@local';
  let admin = await prisma.user.findFirst({
    where: { organizationId: org.id, email: adminEmail },
  });

  if (!admin) {
    const passwordHash = await bcrypt.hash('Admin123!', 12);
    admin = await prisma.user.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        email: adminEmail,
        passwordHash,
        firstName: 'Platform',
        lastName: 'Admin',
        status: 'ACTIVE',
        roles: { create: [{ roleId: adminRole.id }] },
        preferences: { create: { id: randomUUID() } },
      },
    });
    console.log('Created admin user admin@local / Admin123!');
  } else {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: admin.id, roleId: adminRole.id },
      },
      create: { userId: admin.id, roleId: adminRole.id },
      update: {},
    });
    console.log('Admin user already exists');
  }

  await prisma.systemSetting.upsert({
    where: { key: 'platform.name' },
    create: {
      id: randomUUID(),
      key: 'platform.name',
      value: 'Communication API Platform',
      description: 'Display name',
    },
    update: {},
  });

  console.log('Seed complete.');
  console.log(`  Org: ${org.slug} (${org.id})`);
  console.log(`  Channel: ${channel.code} (${channel.id})`);
  console.log(`  Admin: ${adminEmail}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
