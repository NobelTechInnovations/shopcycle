-- CreateTable
CREATE TABLE `theme_file_revisions` (
    `id` VARCHAR(191) NOT NULL,
    `themeFileId` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `theme_file_revisions_themeFileId_createdAt_idx`(`themeFileId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `theme_file_revisions` ADD CONSTRAINT `theme_file_revisions_themeFileId_fkey` FOREIGN KEY (`themeFileId`) REFERENCES `theme_files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
