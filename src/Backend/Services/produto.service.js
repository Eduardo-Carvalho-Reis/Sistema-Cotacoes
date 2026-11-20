import { prisma } from "../prisma/lib/prisma";

export class ProdutoService {
  async validarCategoria(categoriaId) {
    if (categoriaId == null || categoriaId === "") return null;
    const id = Number(categoriaId);
    if (!Number.isInteger(id) || id <= 0 || !await prisma.categoriaProduto.findFirst({ where: { id, ativo: true } })) {
      throw new Error("Categoria do produto invalida ou inativa.");
    }
    return id;
  }

  validarPreco(precoAtual) {
    if (precoAtual != null && (!Number.isFinite(Number(precoAtual)) || Number(precoAtual) < 0)) throw new Error("Preco de referencia deve ser zero ou maior.");
  }

  async criarProduto(dados) {
    this.validarPreco(dados.precoAtual);
    const categoriaId = await this.validarCategoria(dados.categoriaId);
    return prisma.produto.create({
      data: {
        nome: String(dados.nome || "").trim(),
        referencia: dados.referencia || null,
        nomePopular: dados.nomePopular || null,
        unidade: String(dados.unidade || "UN").trim(),
        especificacao: dados.especificacao || null,
        categoriaId,
        precoAtual: dados.precoAtual == null || dados.precoAtual === "" ? null : Number(dados.precoAtual),
      },
      include: { categoria: true },
    });
  }

  async listar() {
    return prisma.produto.findMany({ where: { ativo: true }, include: { categoria: true } });
  }

  async excluir(id) {
    return prisma.produto.update({ where: { id }, data: { ativo: false }, include: { categoria: true } });
  }

  async atualizarProduto(id, dados) {
    this.validarPreco(dados.precoAtual);
    const data = Object.fromEntries(["nome", "referencia", "nomePopular", "unidade", "especificacao", "precoAtual", "ativo"].filter(key => dados[key] !== undefined).map(key => [key, dados[key]]));
    if (data.nome !== undefined) data.nome = String(data.nome).trim();
    if (data.unidade !== undefined) data.unidade = String(data.unidade).trim();
    if (data.precoAtual !== undefined) data.precoAtual = data.precoAtual === null || data.precoAtual === "" ? null : Number(data.precoAtual);
    if (dados.categoriaId !== undefined) data.categoriaId = await this.validarCategoria(dados.categoriaId);
    return prisma.produto.update({ where: { id }, data, include: { categoria: true } });
  }

  async buscarProdutos(busca) {
    return prisma.produto.findMany({
      where: {
        ativo: true,
        ...(busca ? { OR: [
          { nome: { contains: busca } },
          { referencia: { contains: busca } },
          { especificacao: { contains: busca } },
        ] } : {}),
      },
      include: { categoria: true },
    });
  }
}
