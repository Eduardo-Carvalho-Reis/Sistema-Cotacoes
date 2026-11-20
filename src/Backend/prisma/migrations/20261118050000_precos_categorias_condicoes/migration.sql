CREATE TABLE "CategoriaProduto" (
  "id" SERIAL NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "CategoriaProduto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CategoriaProduto_nome_key" ON "CategoriaProduto"("nome");

ALTER TABLE "Produto" ADD COLUMN "categoriaId" INTEGER;
ALTER TABLE "Produto" ADD COLUMN "especificacao" TEXT;
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Produto_categoriaId_idx" ON "Produto"("categoriaId");

ALTER TABLE "CotacaoResposta" ADD COLUMN "frete" DECIMAL(12,2);
ALTER TABLE "CotacaoResposta" ADD COLUMN "condicaoPagamento" TEXT;
