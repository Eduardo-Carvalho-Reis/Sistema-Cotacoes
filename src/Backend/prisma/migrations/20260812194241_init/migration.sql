-- CreateTable
CREATE TABLE `Produto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(191) NOT NULL,
    `referencia` VARCHAR(191) NOT NULL,
    `nomePopular` VARCHAR(191) NULL,
    `unidade` VARCHAR(191) NOT NULL DEFAULT 'UN',
    `precoAtual` DECIMAL(10, 2) NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Produto_referencia_key`(`referencia`),
    INDEX `Produto_ativo_idx`(`ativo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Fornecedor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(191) NOT NULL,
    `cnpj` VARCHAR(191) NULL,
    `telefone` VARCHAR(191) NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Fornecedor_cnpj_key`(`cnpj`),
    INDEX `Fornecedor_ativo_idx`(`ativo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RodadaCotacao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `titulo` VARCHAR(191) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Cotacao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rodadaId` INTEGER NOT NULL,
    `fornecedorId` INTEGER NOT NULL,
    `status` ENUM('ABERTA', 'ENVIADA', 'RESPONDIDA', 'FINALIZADA', 'CANCELADA') NOT NULL DEFAULT 'ABERTA',
    `dataResposta` DATETIME(3) NULL,
    `observacao` VARCHAR(191) NULL,

    UNIQUE INDEX `Cotacao_rodadaId_fornecedorId_key`(`rodadaId`, `fornecedorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ItemCotacao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cotacaoId` INTEGER NOT NULL,
    `produtoId` INTEGER NOT NULL,
    `quantidade` DECIMAL(10, 3) NOT NULL,
    `preco` DECIMAL(10, 2) NULL,
    `observacao` VARCHAR(191) NULL,

    INDEX `ItemCotacao_produtoId_idx`(`produtoId`),
    UNIQUE INDEX `ItemCotacao_cotacaoId_produtoId_key`(`cotacaoId`, `produtoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Cotacao` ADD CONSTRAINT `Cotacao_rodadaId_fkey` FOREIGN KEY (`rodadaId`) REFERENCES `RodadaCotacao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Cotacao` ADD CONSTRAINT `Cotacao_fornecedorId_fkey` FOREIGN KEY (`fornecedorId`) REFERENCES `Fornecedor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemCotacao` ADD CONSTRAINT `ItemCotacao_cotacaoId_fkey` FOREIGN KEY (`cotacaoId`) REFERENCES `Cotacao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemCotacao` ADD CONSTRAINT `ItemCotacao_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `Produto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
