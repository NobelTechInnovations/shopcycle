-- AlterTable
ALTER TABLE `apps` DROP COLUMN `iconEmoji`,
    ADD COLUMN `iconKey` VARCHAR(191) NOT NULL DEFAULT 'puzzle';

