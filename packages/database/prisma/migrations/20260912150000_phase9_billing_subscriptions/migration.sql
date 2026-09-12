-- AlterTable
ALTER TABLE `apps` MODIFY `iconEmoji` VARCHAR(191) NOT NULL DEFAULT '🧩';

-- AlterTable
ALTER TABLE `plans` ADD COLUMN `cartCustomizable` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `commissionPercent` DECIMAL(4, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `hasAdsManagerIncluded` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `hasApiAccess` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `hasCsvExport` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `hasGstSoftware` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `hasMetaAds` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `hasSocialMediaManager` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `hasWhatsappIntegration` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `paidAppsIncluded` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `premiumThemesIncluded` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `prioritySupport` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `razorpayPlanId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `stores` ADD COLUMN `mandateDeadline` DATETIME(3) NULL,
    ADD COLUMN `paymentFailedAt` DATETIME(3) NULL,
    ADD COLUMN `razorpaySubscriptionId` VARCHAR(191) NULL,
    ADD COLUMN `subscriptionStatus` ENUM('no_plan', 'trialing', 'active', 'past_due', 'cancelled') NOT NULL DEFAULT 'no_plan';

-- CreateIndex
CREATE UNIQUE INDEX `plans_razorpayPlanId_key` ON `plans`(`razorpayPlanId`);

-- CreateIndex
CREATE UNIQUE INDEX `stores_razorpaySubscriptionId_key` ON `stores`(`razorpaySubscriptionId`);

