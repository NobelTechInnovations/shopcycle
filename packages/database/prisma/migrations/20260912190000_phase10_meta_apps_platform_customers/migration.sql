-- AlterTable
ALTER TABLE `apps` MODIFY `iconEmoji` VARCHAR(191) NOT NULL DEFAULT '🧩';

-- AlterTable
ALTER TABLE `customers` ADD COLUMN `platformCustomerId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `meta_connections` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NOT NULL,
    `tokenExpiresAt` DATETIME(3) NULL,
    `facebookUserId` VARCHAR(191) NULL,
    `facebookUserName` VARCHAR(191) NULL,
    `adAccountId` VARCHAR(191) NULL,
    `adAccountName` VARCHAR(191) NULL,
    `pageId` VARCHAR(191) NULL,
    `pageName` VARCHAR(191) NULL,
    `wabaId` VARCHAR(191) NULL,
    `wabaName` VARCHAR(191) NULL,
    `phoneNumberId` VARCHAR(191) NULL,
    `phoneNumberLabel` VARCHAR(191) NULL,
    `connectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `meta_connections_storeId_key`(`storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ad_campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `metaCampaignId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `objective` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PAUSED',
    `dailyBudget` DECIMAL(10, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ad_campaigns_storeId_idx`(`storeId`),
    UNIQUE INDEX `ad_campaigns_storeId_metaCampaignId_key`(`storeId`, `metaCampaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_messages` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `toPhone` VARCHAR(191) NOT NULL,
    `direction` VARCHAR(191) NOT NULL DEFAULT 'outbound',
    `kind` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'sent',
    `providerMessageId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `whatsapp_messages_storeId_idx`(`storeId`),
    INDEX `whatsapp_messages_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_customers` (
    `id` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `name` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `platform_customers_phone_key`(`phone`),
    INDEX `platform_customers_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `customers_platformCustomerId_idx` ON `customers`(`platformCustomerId`);

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_platformCustomerId_fkey` FOREIGN KEY (`platformCustomerId`) REFERENCES `platform_customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meta_connections` ADD CONSTRAINT `meta_connections_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ad_campaigns` ADD CONSTRAINT `ad_campaigns_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_messages` ADD CONSTRAINT `whatsapp_messages_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_messages` ADD CONSTRAINT `whatsapp_messages_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

